import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { PoolV1 } from '../wrappers/PoolV1';
import { promptAmount } from '../utils/ui';
import { DexRouter } from '../wrappers/DexRouter';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { promises as fs } from 'fs';

export async function run(provider: NetworkProvider) {
    const filePath = './scripts/config/address.json';
    const data = await fs.readFile(filePath, 'utf8');
    const config = JSON.parse(data);
    const poolAddress = Address.parse(config.Pool);
    const pool = provider.open(PoolV1.createFromAddress(poolAddress));
    const jettonMasterAddress = Address.parse(config.MeMe);
    const queryId = 0n;

    // Input the amount of liquidity to add
    const withdrawLpAmount = await promptAmount('Enter the amount of liquidity to remove:', 9, provider.ui());

    const jettonMaster = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let buyerLpWalletAddress = await pool.getWalletAddress(provider.sender().address!);
    const buyerJettonWalletAddress = await jettonMaster.getWalletAddress(provider.sender().address!);

    const message = PoolV1.packJettonTransfer({
        $$type: 'JettonTransfer',
        queryId: queryId,
        jettonAmount: withdrawLpAmount,
        to: pool.address,
        responseAddress: provider.sender().address!,
        customPayload: null,
        forwardTonAmount: toNano('1'),
        forwardPayload: {
            $$type: 'WithdrawFP',
            asset0MinAmount: 0n,
            asset1MinAmount: 0n,
            recipient: null,
            fulfillPayload: null,
            rejectPayload: null,
        },
    });

    return provider.sender().send({
        to: buyerLpWalletAddress,
        value: toNano('1') * 2n,
        bounce: true,
        body: message,
        sendMode: 1,
    });
}
