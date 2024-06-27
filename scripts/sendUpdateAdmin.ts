import { NetworkProvider, compile } from '@ton/blueprint';
import { Address, Cell, OutActionSendMsg, SendMode, beginCell, toNano, internal as internal_relaxed } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { mnemonicToWalletKey } from '@ton/crypto';
import { promptAddress } from '../utils/ui';
import { HighloadWalletV3 } from '../wrappers/HighloadWalletV3';
import { getRandomInt } from '../utils/utilsForHw';
import { DEFAULT_TIMEOUT, SUBWALLET_ID, maxShift } from '../wrappers/const';
import { HighloadQueryId } from '../wrappers/HighloadQueryId';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// EQCHfPxww7fQ3PCz9R3ZPZ6oPEQ-xPZmkXoVbBYXBW-lRdmS
// EQAom5GG7hykiudPN5CaBs1s2nx7uw-45E7RqSbtElGZXKSN
// EQB7PH4oSBtmM5A9u7-f-f7EMSy0Z8K1juKkNuBZQqxMpBJA
// EQBIcPmm6Bu1x2VW365OZmKk2VNwx4rVzjRDbYNma4q5ud2P
// EQDD3EzQ_ir5Jz6AvBZAq0oVgSC_OcUDgFOupOHAZT2uVP0o
// EQBZOiN2-Ouq4NR5942kCNrS9h3DR8UukRQWrT98KtZqtKW8
export async function run(provider: NetworkProvider) {
    const updateTargetMasterAddresses = 'EQBZOiN2-Ouq4NR5942kCNrS9h3DR8UukRQWrT98KtZqtKW8';

    const newCode = await compile(JettonMasterBondV1.name);

    // Fetch data for each address
    console.log(`Fetching data for ${updateTargetMasterAddresses} \n`);
    let jettonMasterAddress = Address.parse(updateTargetMasterAddresses);
    const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
    const masterData = await jettonMasterBondV1.getMasterData();
    await sleep(1000);
    const jettonData = await jettonMasterBondV1.getJettonData();

    const tonReserves: bigint = masterData.tonReserves;
    const jettonReserves: bigint = masterData.jettonReserves;
    const fee: bigint = masterData.fee;
    const totalSupply: bigint = masterData.totalSupply;
    const onMoon: boolean = masterData.onMoon;
    const adminAddress: Address = Address.parse('UQBpm3i6ujcLCarILtxuRolVf19t3CT-eRoVYc2COC-9EnPg'); // mainnet highload wallet
    const jettonWalletCode: Cell = jettonData.walletCode;
    const jettonContent: Cell = jettonData.content;

    const basicInfo = beginCell().storeBit(onMoon).storeRef(jettonWalletCode).storeRef(jettonContent).endCell();
    const vTon = masterData.vTon;
    const tonTheMoon = masterData.tonTheMoon;
    const feeRate = masterData.feeRate;
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

    await sleep(1000);

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
