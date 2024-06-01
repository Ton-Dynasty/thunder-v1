import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, toNano } from '@ton/core';
import { PoolV1 } from '../wrappers/PoolV1';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { loadJMBondFixture, buyToken } from './helper';
import { DexRouter } from '../wrappers/DexRouter';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { Op } from '../wrappers/JettonConstants';

describe('PoolV1', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolV1: SandboxContract<PoolV1>;
    let poolV1Code: Cell;
    let jettonWalletCode: Cell;
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;

    beforeAll(async () => {
        poolV1Code = await compile(PoolV1.name);
        jettonWalletCode = await compile(JettonWallet.name);
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        ({ blockchain, deployer, dexRouter, jettonMasterBondV1 } = await loadJMBondFixture());
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);
        let poolAddress = await dexRouter.getPoolAddress(jettonMasterBondV1.address);
        poolV1 = blockchain.openContract(PoolV1.createFromAddress(poolAddress));
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and poolV1 are ready to use
    });

});
