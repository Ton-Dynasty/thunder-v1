import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { PoolV1 } from '../wrappers/PoolV1';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('PoolV1', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('PoolV1');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolV1: SandboxContract<PoolV1>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        poolV1 = blockchain.openContract(PoolV1.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await poolV1.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: poolV1.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and poolV1 are ready to use
    });
});
