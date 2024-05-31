import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { FarmV1 } from '../wrappers/FarmV1';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('FarmV1', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('FarmV1');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let farmV1: SandboxContract<FarmV1>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        farmV1 = blockchain.openContract(FarmV1.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await farmV1.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: farmV1.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and farmV1 are ready to use
    });
});
