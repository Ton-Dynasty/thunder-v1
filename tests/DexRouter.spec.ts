import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { DexRouter } from '../wrappers/DexRouter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('DexRouter', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('DexRouter');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let dexRouter: SandboxContract<DexRouter>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        dexRouter = blockchain.openContract(DexRouter.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

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
