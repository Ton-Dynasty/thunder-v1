import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { DexRouter } from '../wrappers/DexRouter';
import { compile } from '@ton/blueprint';
import { JettonWallet, LpJettonWallet } from '../wrappers/JettonWallet';
import { PoolV1 } from '../wrappers/PoolV1';

export async function loadJMBondFixture() {
    const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
    const dexRouterCode = await compile(DexRouter.name);
    const jettonWalletCode = await compile(JettonWallet.name);
    const jettonLpCode = await compile(LpJettonWallet.name);
    const poolCode = await compile(PoolV1.name);

    const blockchain = await Blockchain.create();
    const deployer = await blockchain.treasury('deployer', { workchain: 0, balance: toNano('100000000') });

    const dexRouter = blockchain.openContract(
        DexRouter.createFromConfig(
            {
                ownerAddress: deployer.address,
                poolCode: poolCode,
                lpWalletCode: jettonLpCode,
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

export const buyToken = async (
    jettonMasterBondV1: SandboxContract<JettonMasterBondV1>,
    buyer: SandboxContract<TreasuryContract>,
    tonAmount: bigint = toNano('10'),
    min_token_out: bigint = 0n,
    destination: Address = buyer.address,
    response_address: Address = buyer.address,
    custom_payload: Cell | null = null,
    forward_ton_amount: bigint = 0n,
    forward_payload: Cell = beginCell().storeUint(0n, 1).endCell(),
) => {
    let sendAllTon = tonAmount + toNano('1');
    return await jettonMasterBondV1.sendBuyToken(
        buyer.getSender(),
        { value: sendAllTon },
        {
            $$type: 'BuyToken',
            query_id: 0n,
            ton_amount: tonAmount,
            minTokenOut: min_token_out,
            destination: destination,
            response_address: response_address,
            custom_payload: custom_payload,
            forward_ton_amount: forward_ton_amount,
            forward_payload: forward_payload,
        },
    );
};
