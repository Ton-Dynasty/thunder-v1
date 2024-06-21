import { Address, beginCell, toNano, internal as internal_relaxed, SendMode } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { promptAddress, promptToncoin } from '../utils/ui';
import { mnemonicToWalletKey } from '@ton/crypto';
import { HighloadWalletV3 } from '../wrappers/HighloadWalletV3';
import { getRandomInt } from '../utils/utilsForHw';
import { DEFAULT_TIMEOUT, SUBWALLET_ID, maxShift } from '../wrappers/const';
import { HighloadQueryId } from '../wrappers/HighloadQueryId';

export async function run(provider: NetworkProvider) {
    const mnemonic = process.env.WALLET_MNEMONIC!.split(' ');
    const keyPair = await mnemonicToWalletKey(mnemonic);

    const highloadWalletV3Address = Address.parse('0QCg05dcxHO09Ydrw-yTuexzMUa8iJmYAO4eWmyqfgVnDZ_0'); //await promptAddress('Enter your highload-wallet-v3 address: ', provider.ui());
    const highloadWalletV3 = provider.open(HighloadWalletV3.createFromAddress(highloadWalletV3Address));

    const rndShift = getRandomInt(0, maxShift);
    const rndBitNum = 1022;

    // You can pack your own messages here
    const queryId = HighloadQueryId.fromShiftAndBitNumber(BigInt(rndShift), BigInt(rndBitNum));
    const message = JettonMasterBondV1.packClaim({
        $$type: 'Claim',
        queryId: 0n,
    });

    const jettonMasterAddress = await promptAddress('Enter the JettonMasterBondV1 address: ', provider.ui());
    await highloadWalletV3.sendExternalMessage(keyPair.secretKey, {
        query_id: queryId,
        message: internal_relaxed({
            to: jettonMasterAddress,
            bounce: false,
            value: toNano('0.1'),
            body: message,
        }),
        createdAt: Math.floor(Date.now() / 1000) - 10,
        mode: SendMode.PAY_GAS_SEPARATELY,
        subwalletId: SUBWALLET_ID,
        timeout: DEFAULT_TIMEOUT,
    });
}
