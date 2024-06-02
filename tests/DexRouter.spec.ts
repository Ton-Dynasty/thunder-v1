import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { DexRouter } from '../wrappers/DexRouter';
import { PoolV1 } from '../wrappers/PoolV1';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('DexRouter', () => {
    let dexRouterCode: Cell;
    let poolCode: Cell;
    let lpWalletCode: Cell;

    beforeAll(async () => {
        dexRouterCode = await compile(DexRouter.name);
        poolCode = await compile(PoolV1.name);
        lpWalletCode = await compile(JettonWallet.name);
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let dexRouter: SandboxContract<DexRouter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        dexRouter = blockchain.openContract(
            DexRouter.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    poolCode,
                    lpWalletCode,
                },
                dexRouterCode,
            ),
        );

        const deployResult = await dexRouter.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: dexRouter.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and dexRouter are ready to use
    });
});
