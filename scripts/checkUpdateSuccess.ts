import { NetworkProvider, compile } from '@ton/blueprint';
import { Address, Cell, SendMode, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(provider: NetworkProvider) {
    const updateTargetMasterAddresses = [
        // 'EQBR8UKW2QsoQ2XUsYXCxHE9vq8Rx1P5ByElvuRjMeOgH0Q4',
        // 'EQBrVBXD0YNONYFcqEIql0m7GkjTNMkrCESWAFsjQN74IdFZ',
        // 'EQBSYoMEr8r-RbiuJfsqDP4kh7y-EC3pXb0QksVNBwInZupH',
        // 'EQB-t2hRTVpcirhBkOo7d5JuXiP6s_RIShq4zhDZVlhkGuYh',
        // 'EQCeDDdaopqdTQ-lkwQJkMI5EZjod2N5GQfOPgILirODPU9_',
        // 'EQCEeg8oqHUvqYugl24_97ONIe12DJICjYqJdHT6OMN9HxtM',
        'EQCEpGG1QKVlgRz7HtrvlozYOuFPleJiRHzrwa7poCF2Acf5',
    ];

    const newCode = await compile(JettonMasterBondV1.name);
    const updateDataList = [];

    // Fetch data for each address
    for (const address of updateTargetMasterAddresses) {
        console.log(`Fetching data for ${address}`);
        const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(Address.parse(address)));
        const masterData = await jettonMasterBondV1.getMasterData();
        await sleep(1000);
        const jettonData = await jettonMasterBondV1.getJettonData();

        const tonReserves: bigint = masterData.tonReserves;
        const jettonReserves: bigint = masterData.jettonReserves;
        const fee: bigint = masterData.fee;
        const totalSupply: bigint = masterData.totalSupply;
        const onMoon: boolean = masterData.onMoon;
        const adminAddress: Address = masterData.adminAddress;
        const jettonWalletCode: Cell = jettonData.walletCode;
        const jettonContent: Cell = jettonData.content;
        const vTon = masterData.vTon; // 1000n * toNano('1');
        const tonTheMoon = masterData.tonTheMoon; // 1500n * toNano('1');
        const feeRate = masterData.feeRate; // 10n;

        // Expect that admin address is new address
        const newAdminAddress = Address.parse('0QCg05dcxHO09Ydrw-yTuexzMUa8iJmYAO4eWmyqfgVnDZ_0');
        let updateSuccess = true;
        if (adminAddress.toString() !== newAdminAddress.toString()) {
            console.log(`Admin address is not new address: ${adminAddress.toString()}`);
            updateSuccess = false;
        }

        if (vTon != 1000n * toNano('1')) {
            console.log(`vTon is not 1000n * toNano('1'): ${vTon}`);
            updateSuccess = false;
        }

        if (tonTheMoon != 1500n * toNano('1')) {
            console.log(`tonTheMoon is not 1500n * toNano('1'): ${tonTheMoon}`);
            updateSuccess = false;
        }

        if (feeRate != 10n) {
            console.log(`feeRate is not 10n: ${feeRate}`);
            updateSuccess = false;
        }

        if (updateSuccess) {
            console.log(`Update success for ${address} \n`);
        } else {
            console.log(`Update failed for ${address} \n`);
        }

        // await sleep(1000);
    }
}
