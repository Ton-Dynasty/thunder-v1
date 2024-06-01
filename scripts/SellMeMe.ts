import { Address, beginCell, toNano } from '@ton/core';
import { DexRouter } from '../wrappers/DexRouter';
import { compile, NetworkProvider } from '@ton/blueprint';
import { PoolV1 } from '../wrappers/PoolV1';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { JettonWallet } from '../wrappers/JettonWallet';
import { promptAddress, promptAmount } from '../utils/ui';

export async function run(provider: NetworkProvider) {
    // configurable constants
    const decimals = 9;

    const jettonMasterAddress = await promptAddress('Enter the JettonMasterBondV1 address: ', provider.ui());
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    const userMeMeWalletAddress = await jettonMasterBondV1.getWalletAddress(provider.sender().address!);
    const userMemeWallet = provider.open(JettonWallet.createFromAddress(userMeMeWalletAddress));
    const { balance } = await userMemeWallet.getWalletData();
    const burnAmount = await promptAmount(`Enter the amount of MEME to sell (max: ${Number(balance) / 10**decimals}): `, decimals, provider.ui()); // prettier-ignore

    // let burnAmount = 49475509622737n / 4n; // Pay 0.5 TON to buy MEME in the first place

    const msg = JettonWallet.burnMessage(burnAmount, provider.sender().address!, null);

    await provider.sender().send({
        to: userMeMeWalletAddress,
        value: toNano('2'),
        body: msg,
    });
}
