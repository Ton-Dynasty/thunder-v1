import { NetworkProvider, compile } from '@ton/blueprint';
import { Address, Cell, SendMode, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';

export async function run(provider: NetworkProvider) {
    const updateTargetMasterAddress = Address.parse('EQDfP0qCL0n_WFofADEeXVSYtUUaHtnWHm4S5kALD5yia9JY');
    const newCode = await compile(JettonMasterBondV1.name);
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(updateTargetMasterAddress));
    const masterData = await jettonMasterBondV1.getMasterData();
    const tonReserves: bigint = masterData.tonReserves;
    const jettonReserves: bigint = masterData.jettonReserves;
    const fee: bigint = masterData.fee;
    const totalSupply: bigint = masterData.totalSupply;
    const onMoon: boolean = masterData.onMoon;
    const adminAddress: Address = masterData.adminAddress;
    const jettonData = await jettonMasterBondV1.getJettonData();
    const jettonWalletCode: Cell = jettonData.walletCode;
    const jettonContent: Cell = jettonData.content;

    const basicInfo = beginCell().storeBit(onMoon).storeRef(jettonWalletCode).storeRef(jettonContent).endCell();
    const vTon = 1000n * toNano('1');
    const tonTheMoon = 1500n * toNano('1');
    const feeRate = 10n;
    const parmsInfo = beginCell().storeCoins(vTon).storeCoins(tonTheMoon).storeUint(feeRate, 16).endCell();

    const newData: Cell = beginCell()
        .storeCoins(totalSupply)
        .storeAddress(adminAddress)
        .storeCoins(tonReserves)
        .storeCoins(jettonReserves)
        .storeCoins(fee)
        .storeRef(basicInfo)
        .storeRef(parmsInfo)
        .endCell();
    await jettonMasterBondV1.sendUpgrade(
        provider.sender(),
        { value: toNano('0.003'), bounce: true },
        {
            $$type: 'Upgrade',
            queryId: 0n,
            newCode: newCode,
            newData: newData,
        },
        SendMode.PAY_GAS_SEPARATELY,
    );
}
