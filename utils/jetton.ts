import { beginCell, Cell, Dictionary } from '@ton/core';
import { sha256_sync } from '@ton/crypto';

export const ONCHAIN_CONTENT_PREFIX = 0x00;
export const OFFCHAIN_TAG = 0x01;
export const SNAKE_PREFIX = 0x00;
export const CELL_MAX_SIZE_BYTES = Math.floor((1023 - 8) / 8);
export interface JettonContent {
    uri?: string;
    name?: string;
    description?: string;
    symbol?: string;
    image?: string;
    decimals?: string;
    amount_style?: string;
    render_type?: string;
}

function bufferToChunks(buff: Buffer, chunkSize: number) {
    let chunks: Buffer[] = [];
    while (buff.byteLength > 0) {
        chunks.push(buff.subarray(0, chunkSize));
        buff = buff.subarray(chunkSize);
    }
    return chunks;
}

function makeSnakeCell(data: Buffer) {
    let chunks = bufferToChunks(data, CELL_MAX_SIZE_BYTES);
    const b = chunks.reduceRight((curCell, chunk, index) => {
        if (index === 0) {
            curCell.storeInt(SNAKE_PREFIX, 8);
        }
        curCell.storeBuffer(chunk);
        if (index > 0) {
            const cell = curCell.endCell();
            return beginCell().storeRef(cell);
        } else {
            return curCell;
        }
    }, beginCell());
    return b.endCell();
}

const toKey = (key: string) => {
    return BigInt(`0x${sha256_sync(key).toString('hex')}`);
};

export function buildJettonContent(data: JettonContent): Cell {
    let dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    Object.entries(data).forEach(([key, value]) => {
        if (!!value) {
            dict.set(toKey(key), makeSnakeCell(Buffer.from(value, 'utf8')));
        }
    });
    return beginCell().storeInt(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
}

export type JettonContentUri = {
    uri: string;
};

export function jettonContentToCell(content: JettonContentUri) {
    return beginCell()
        .storeStringRefTail(content.uri) //Snake logic under the hood
        .endCell();
}
