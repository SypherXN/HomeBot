using Microsoft.Data.Sqlite;

/// <summary>Applies or reverts budget account balance changes for income, expense, and transfer rows.</summary>
public static class BudgetAccountBalance
{
    public static int ResolveDefaultAccountId(SqliteConnection conn)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT Id FROM BudgetAccounts WHERE IsActive=1 ORDER BY Id LIMIT 1";
        var v = cmd.ExecuteScalar();
        if (v == null)
        {
            cmd.CommandText = "SELECT Id FROM BudgetAccounts ORDER BY Id LIMIT 1";
            v = cmd.ExecuteScalar();
        }

        return v == null ? 1 : Convert.ToInt32(v);
    }

    public static void ApplyTransaction(
        SqliteConnection conn,
        SqliteTransaction tx,
        BudgetTransactionListItemModel row,
        int defaultAccountId)
    {
        if (string.Equals(row.Type, "transfer", StringComparison.OrdinalIgnoreCase))
        {
            var from = row.AccountId ?? defaultAccountId;
            if (row.TransferToAccountId is { } to)
            {
                ApplyDelta(conn, tx, from, "transfer_out", row.Amount);
                ApplyDelta(conn, tx, to, "transfer_in", row.Amount);
            }

            return;
        }

        if (string.Equals(row.Type, "expense", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(row.Type, "income", StringComparison.OrdinalIgnoreCase))
        {
            ApplyDelta(conn, tx, row.AccountId ?? defaultAccountId, row.Type, row.Amount);
        }
    }

    public static void RevertTransaction(
        SqliteConnection conn,
        SqliteTransaction tx,
        BudgetTransactionListItemModel row,
        int defaultAccountId)
    {
        if (string.Equals(row.Type, "transfer", StringComparison.OrdinalIgnoreCase))
        {
            var from = row.AccountId ?? defaultAccountId;
            if (row.TransferToAccountId is { } to)
            {
                ApplyDelta(conn, tx, from, "transfer_in", row.Amount);
                ApplyDelta(conn, tx, to, "transfer_out", row.Amount);
            }

            return;
        }

        if (string.Equals(row.Type, "expense", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(row.Type, "income", StringComparison.OrdinalIgnoreCase))
        {
            var reverseType = row.Type.Equals("income", StringComparison.OrdinalIgnoreCase) ? "expense" : "income";
            ApplyDelta(conn, tx, row.AccountId ?? defaultAccountId, reverseType, row.Amount);
        }
    }

    public static bool TryLoadTransaction(SqliteConnection conn, int id, out BudgetTransactionListItemModel row)
    {
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT Type, Amount, AccountId, TransferToAccountId
            FROM BudgetTransactions
            WHERE Id=$id";
        cmd.Parameters.AddWithValue("$id", id);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
        {
            row = null!;
            return false;
        }

        row = new BudgetTransactionListItemModel
        {
            Id = id,
            Type = reader.GetString(0),
            Amount = reader.GetDouble(1),
            AccountId = reader.IsDBNull(2) ? null : reader.GetInt32(2),
            TransferToAccountId = reader.IsDBNull(3) ? null : reader.GetInt32(3)
        };
        return true;
    }

    private static void ApplyDelta(SqliteConnection conn, SqliteTransaction tx, int accountId, string type, double amount)
    {
        var delta = type switch
        {
            "income" => amount,
            "expense" => -amount,
            "transfer_out" => -amount,
            "transfer_in" => amount,
            _ => 0d
        };
        if (delta == 0) return;

        var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "UPDATE BudgetAccounts SET CurrentBalance = CurrentBalance + $d WHERE Id=$id";
        cmd.Parameters.AddWithValue("$d", delta);
        cmd.Parameters.AddWithValue("$id", accountId);
        cmd.ExecuteNonQuery();
    }
}
