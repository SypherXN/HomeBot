/** Build a Budget URL that opens the ledger and highlights a transaction. */
export function budgetLedgerHighlightPath(transactionId: number): string {
  return `/budget?tab=ledger&highlight=${transactionId}`;
}
