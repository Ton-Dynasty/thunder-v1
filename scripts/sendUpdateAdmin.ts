import { NetworkProvider, compile } from '@ton/blueprint';
import { Address, Cell, OutActionSendMsg, SendMode, beginCell, toNano, internal as internal_relaxed } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';


function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(provider: NetworkProvider) {
    const updateTargetMasterAddresses = 'EQCEpGG1QKVlgRz7HtrvlozYOuFPleJiRHzrwa7poCF2Acf5';

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
    const adminAddress: Address = Address.parse('0QCg05dcxHO09Ydrw-yTuexzMUa8iJmYAO4eWmyqfgVnDZ_0');
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
// Testnet addresses:
// "EQBR8UKW2QsoQ2XUsYXCxHE9vq8Rx1P5ByElvuRjMeOgH0Q4"
// "EQBrVBXD0YNONYFcqEIql0m7GkjTNMkrCESWAFsjQN74IdFZ"
// "EQBSYoMEr8r-RbiuJfsqDP4kh7y-EC3pXb0QksVNBwInZupH"
// "EQB-t2hRTVpcirhBkOo7d5JuXiP6s_RIShq4zhDZVlhkGuYh"
// "EQBur86nY3jCmcfe60YxsF_cY3rFWboIv_ySDVWBNi8QhQCH"
// "EQCeDDdaopqdTQ-lkwQJkMI5EZjod2N5GQfOPgILirODPU9_"
// "EQCEeg8oqHUvqYugl24_97ONIe12DJICjYqJdHT6OMN9HxtM"
// "EQCEpGG1QKVlgRz7HtrvlozYOuFPleJiRHzrwa7poCF2Acf5" v
// "EQCGvjJoORqCUEgCq38yfKdfRZyB8iQvhNOgZV-F3XQF1Ngj"
// "EQCIorKA1pmBFAQflVldDZy9Lq2M5YBVS_bfji0ZRDDqG784"
// "EQCISG3MQHKyKggYcmnaXZhuXG9QskqLxla6fLoD3U3vBd-L"
// "EQCJdj384DrJ83K72uu183tUtj1xxFGWK2K_Un9c_VRhORPE"
// "EQCP6mO__OgmWtvF2lQDxi6G075KCNBs6-VPkRCOKTLAMA7z"
// "EQCsbAIQGCUwxiVpExZtlvFlrXPeBSCjPqleBbD-7pCSPqtm"
// "EQCSG9ZSw030d4iMnbxCcpshaT1ZPsk38xr6_TlbCnzBiSeJ"
// "EQC_Y0jX9KW_I5SS3j_LwtY1Y2R7A8CQN5cRThhnMQW13wwi"
// "EQD7kBVVIAlsFV9B0yYlkm5gdP1-BEZBvqncAZYbug9RRjgu"
// "EQD947eDsNLe7oi02DfDRNWY18wTnIdzyfyn2RLgWhNOK0jx"
// "EQDDSZ0-qmRJan6D076mpIb1OYSbLOpNBTIAgnKg78w6rRsx"
// "EQDgTOKMlMlI6kS4HcIm5R94dduLWcNZQDxjWkDLGfArYgyY"
// "EQDhq8SqcBsFcFWrpVB1pw0tnkEhy9DKr0OAcFMiRFsp-o2V"
