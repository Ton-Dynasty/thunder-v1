import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { DexRouter } from '../wrappers/DexRouter';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';

export async function loadFixture() {
    const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
    const dexRouterCode = await compile(DexRouter.name);
    const jettonWalletCode = await compile(JettonWallet.name);

    const blockchain = await Blockchain.create();
    const deployer = await blockchain.treasury('deployer', { workchain: 0, balance: toNano('100000000') });

    const dexRouter = blockchain.openContract(
        DexRouter.createFromConfig(
            {
                ownerAddress: deployer.address,
                poolCode: beginCell().endCell(),
            },
            dexRouterCode,
        ),
    );

    const deployDexRouterResult = await dexRouter.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployDexRouterResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: dexRouter.address,
        deploy: true,
        success: true,
    });

    const jettonMasterBondV1 = blockchain.openContract(
        JettonMasterBondV1.createFromConfig(
            {
                totalSupply: toNano('100000000'),
                adminAddress: deployer.address,
                tonReserves: 0n,
                jettonReserves: toNano('100000000'),
                fee: 0n,
                onMoon: 0n,
                dexRouter: dexRouter.address,
                jettonWalletCode: jettonWalletCode,
                jettonContent: beginCell().endCell(),
            },
            jettonMasterBondV1Code,
        ),
    );

    const deployJettonMasterResult = await jettonMasterBondV1.sendDeploy(deployer.getSender(), toNano('0.05'));
    expect(deployJettonMasterResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: jettonMasterBondV1.address,
        deploy: true,
        success: true,
    });

    return { blockchain, deployer, dexRouter, jettonMasterBondV1 };
}
