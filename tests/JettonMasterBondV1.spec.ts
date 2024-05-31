import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Cell, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { DexRouter } from '../wrappers/DexRouter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { loadFixture } from './helper';

describe('JettonMasterBondV1', () => {
    let jettonMasterBondV1Code: Cell;
    let dexRouterCode: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
        dexRouterCode = await compile(DexRouter.name);
        jettonWalletCode = await compile(JettonWallet.name);
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;

    beforeEach(async () => {
        ({ blockchain, deployer, dexRouter, jettonMasterBondV1 } = await loadFixture());
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and jettonMasterBondV1 are ready to use
    });
});
