import { NetworkProvider, compile } from '@ton/blueprint';
import { Address, Cell, SendMode, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(provider: NetworkProvider) {
    const updateTargetMasterAddresses = [
        'EQCHfPxww7fQ3PCz9R3ZPZ6oPEQ-xPZmkXoVbBYXBW-lRdmS',
        'EQAom5GG7hykiudPN5CaBs1s2nx7uw-45E7RqSbtElGZXKSN',
        'EQB7PH4oSBtmM5A9u7-f-f7EMSy0Z8K1juKkNuBZQqxMpBJA',
        'EQBIcPmm6Bu1x2VW365OZmKk2VNwx4rVzjRDbYNma4q5ud2P',
        'EQDD3EzQ_ir5Jz6AvBZAq0oVgSC_OcUDgFOupOHAZT2uVP0o',
        'EQBZOiN2-Ouq4NR5942kCNrS9h3DR8UukRQWrT98KtZqtKW8',
        'EQAFi5oSlQ5AQ0djhb3mv34NycXHYVvX9YGtPWqGarZDegk1',
        'EQBYhf39WQubksGKb1e07UU9tyr-ru1ZfLuVfEHoIjTo7ysj',
        'EQCO1aU3btp0RzlkPqdpBg0oM-y7-YKYtsHL7kZMF5Nsn3uh',
        'EQDPZ_XocWSnSOcAgby-h5ouCRakqg8MRcmPMjn6j4otvJv3',
        'EQDe_2PRP2vp7Pj8Hbjn7CV6MdFnvYv6IG0ItjZgDSFINPxr',
        'EQDjo23PCOTYjA5MN-TCyp3H5ezqwZIi5YOOjiSfR9Qq0r-G',
        'EQA5fobVZ_SMaj7ERbHRFXVYFW-0u3UIWpAlm8KcotxYnyNr',
        'EQBriQlWcT52ptuLn7ku0Pm8WkBckRSS2FgN6gyXAhPLSCAU',
        'EQChzLIp8iurPhxXMw2q1gCTX-dBL9w6UUjA7IZPQiwtnrfH',
        'EQCVFOjIz4Ns10wBJavvw1fnITT5hkpC1OFX66Zo-B5y4wBo',
        'EQDm0RM14knW8uJVS8Sp0YJXiP58oDHxUie0FshYsc4-NZS3',
        'EQBn1WGDV88iSH49zUnAOTsETpamD28abs9drcloQe9sCfw1',
        'EQDQJusB6sdqYTgRSyMkKYhmqA5aPVqou6loL2lDTdyZn_em',
        'EQD9b4y5saarMarVxoRyuBZLTndaRfBaygsszyQO0WDt6y9s',
        'EQDU-ynHEB1g_oWlzJKdJDI14tWUti2jhulnz4h7POadvkYG',
        'EQBUVSj2btKBmlXwZA-z0zu6U2IUN5dzhbsSXh8ltPdc_6R2',
        'EQAcSDjM5D_bEVLD7ElukRs6hz9wQ7Cbt55ihFmNEheBB9s1',
        'EQDfP0qCL0n_WFofADEeXVSYtUUaHtnWHm4S5kALD5yia9JY',
        'EQDDmkB22kWScUUgmnM_1sY2dQJ3jFo8ADX5uvT9weqXAWc8',
        'EQAxbMSliXBeUluEiQO38ypgcZAZp-Dr1p-tVxt2cH_V4pgt',
    ];

    // Fetch data for each address
    for (const address of updateTargetMasterAddresses) {
        console.log(`Fetching data for ${address}`);
        const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(Address.parse(address)));
        const masterData = await jettonMasterBondV1.getMasterData();
        await sleep(1000);

        const adminAddress: Address | null = masterData.adminAddress;
        const vTon = masterData.vTon; // 1000n * toNano('1');
        const tonTheMoon = masterData.tonTheMoon; // 1500n * toNano('1');
        const feeRate = masterData.feeRate; // 10n;

        // Expect that admin address is new address
        const newAdminAddress = Address.parse('UQBpm3i6ujcLCarILtxuRolVf19t3CT-eRoVYc2COC-9EnPg');
        let updateSuccess = true;
        if (adminAddress!.toString() !== newAdminAddress.toString()) {
            console.log(`Admin address is not new address: ${adminAddress!.toString()}`);
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
