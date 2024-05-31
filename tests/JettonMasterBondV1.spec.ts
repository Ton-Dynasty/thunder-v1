import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('JettonMasterBondV1', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('JettonMasterBondV1');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        jettonMasterBondV1 = blockchain.openContract(JettonMasterBondV1.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await jettonMasterBondV1.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMasterBondV1.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and jettonMasterBondV1 are ready to use
    });
});
