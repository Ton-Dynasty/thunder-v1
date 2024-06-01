import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, toNano } from '@ton/core';
import { PoolV1 } from '../wrappers/PoolV1';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('PoolV1', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolV1: SandboxContract<PoolV1>;
    let poolV1Code: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        poolV1Code = await compile(PoolV1.name);
        jettonWalletCode = await compile(JettonWallet.name);
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        poolV1 = blockchain.openContract(
            PoolV1.createFromConfig(
                {
                    adminAddress: deployer.address,
                    dexRouter: deployer.address,
                    asset0: deployer.address, // for test
                    asset1: deployer.address, // for test
                    reserve0: toNano('0'),
                    reserve1: toNano('0'),
                    lpTotalSupply: toNano('0'),
                    adminFee: toNano('0'),
                    swapFee: toNano('0'),
                    lpJettonWalletCode: jettonWalletCode,
                    lpJettonContent: jettonWalletCode, // for test
                },
                poolV1Code,
            ),
        );

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

    it('should first deposit', async () => {
        const depositResult = await poolV1.sendDeposit(
            deployer.getSender(),
            { value: toNano('100') },
            {
                $$type: 'Deposit',
                queryId: BigInt(0),
                asset0Amount: toNano('100'),
                asset1Amount: toNano('100'),
                minLpAmount: toNano('0'),
                lpReceiver: null,
                fulfillPayload: null,
                rejectPayload: null,
            },
        );

        printTransactionFees(depositResult.transactions);

        expect(depositResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: poolV1.address,
            success: true,
        });
    });
});
