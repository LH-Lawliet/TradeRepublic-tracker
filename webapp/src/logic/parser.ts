import Papa from "papaparse";
import type { Transaction } from "./types";

/**
 * Parses the uploaded CSV File object into strongly typed Transaction records.
 */
export function parseCsvFile(file: File): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
        Papa.parse<Transaction>(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    console.warn("Parse warnings:", results.errors);
                }
                resolve(results.data);
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    });
}