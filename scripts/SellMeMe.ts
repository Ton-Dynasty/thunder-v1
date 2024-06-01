import { Address, beginCell, toNano } from '@ton/core';
import { DexRouter } from '../wrappers/DexRouter';
import { compile, NetworkProvider } from '@ton/blueprint';
import { PoolV1 } from '../wrappers/PoolV1';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { JettonWallet } from '../wrappers/JettonWallet';

export async function run(provider: NetworkProvider) {
    const jettonMasterAddress = Address.parse('EQBlp2jL9j0cbIfVuUNWCdbEwn3wn6FP5waw6ZwQ66FjnUpn');
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    let userMeMeWalletAddress = await jettonMasterBondV1.getWalletAddress(provider.sender().address!);
    let userMeMeWallet = provider.open(JettonWallet.createFromAddress(userMeMeWalletAddress));

    let burnAmount = 49475509622737n / 4n; // Pay 0.5 TON to buy MEME in the first place

    let msg = JettonWallet.burnMessage(burnAmount, provider.sender().address!, null);

    await provider.sender().send({
        to: userMeMeWalletAddress,
        value: toNano('2'),
        body: msg,
    });
}
