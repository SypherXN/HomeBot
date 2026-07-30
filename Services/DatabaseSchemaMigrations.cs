using Microsoft.Data.Sqlite;

/// <summary>
/// Ordered schema migrations for HomeBot SQLite (additive only).
/// </summary>
public static class DatabaseSchemaMigrations
{
    public static IReadOnlyList<SchemaMigrationRunner.Migration> All { get; } = new[]
    {
        new SchemaMigrationRunner.Migration("001_calendar_recurrence_exception_columns", conn =>
        {
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN ExceptionKind TEXT NOT NULL DEFAULT 'omit'");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN OverrideTitle TEXT");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN OverrideDescription TEXT");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN OverrideNotes TEXT");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN OverrideLink TEXT");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN OverrideInstanceStartUtc TEXT");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN OverrideInstanceEndUtc TEXT");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarRecurrenceExceptions ADD COLUMN InstanceCompleted INTEGER NOT NULL DEFAULT 0");
        }),

        new SchemaMigrationRunner.Migration("002_budget_core", conn =>
        {
            SchemaMigrationRunner.Execute(conn, @"
                CREATE TABLE IF NOT EXISTS BudgetCategories (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Color TEXT,
                    Icon TEXT,
                    Visibility TEXT NOT NULL DEFAULT 'household',
                    IsTaxDeductible INTEGER NOT NULL DEFAULT 0,
                    SortOrder INTEGER NOT NULL DEFAULT 0,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS BudgetAccounts (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    AccountType TEXT NOT NULL DEFAULT 'checking',
                    Currency TEXT NOT NULL DEFAULT 'USD',
                    CreditLimit REAL,
                    CurrentBalance REAL NOT NULL DEFAULT 0,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS BudgetTransactions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Type TEXT NOT NULL,
                    Amount REAL NOT NULL,
                    AmountInput TEXT,
                    CategoryId INTEGER,
                    SpentByUserId INTEGER NOT NULL DEFAULT 0,
                    AccountId INTEGER,
                    TransferToAccountId INTEGER,
                    Note TEXT,
                    Merchant TEXT,
                    TransactionDate TEXT NOT NULL,
                    ClearedAt TEXT,
                    IsPending INTEGER NOT NULL DEFAULT 0,
                    Currency TEXT NOT NULL DEFAULT 'USD',
                    ExchangeRateToHome REAL NOT NULL DEFAULT 1,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (CategoryId) REFERENCES BudgetCategories(Id),
                    FOREIGN KEY (AccountId) REFERENCES BudgetAccounts(Id),
                    FOREIGN KEY (TransferToAccountId) REFERENCES BudgetAccounts(Id)
                );

                CREATE INDEX IF NOT EXISTS IX_BudgetTransactions_Date
                    ON BudgetTransactions(TransactionDate);
                CREATE INDEX IF NOT EXISTS IX_BudgetTransactions_Spender
                    ON BudgetTransactions(SpentByUserId);
                CREATE INDEX IF NOT EXISTS IX_BudgetTransactions_Category
                    ON BudgetTransactions(CategoryId);

                CREATE TABLE IF NOT EXISTS BudgetTransactionSplits (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    TransactionId INTEGER NOT NULL,
                    CategoryId INTEGER,
                    SpentByUserId INTEGER,
                    Amount REAL NOT NULL,
                    FOREIGN KEY (TransactionId) REFERENCES BudgetTransactions(Id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS BudgetTags (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL COLLATE NOCASE UNIQUE
                );

                CREATE TABLE IF NOT EXISTS BudgetTransactionTags (
                    TransactionId INTEGER NOT NULL,
                    TagId INTEGER NOT NULL,
                    PRIMARY KEY (TransactionId, TagId),
                    FOREIGN KEY (TransactionId) REFERENCES BudgetTransactions(Id) ON DELETE CASCADE,
                    FOREIGN KEY (TagId) REFERENCES BudgetTags(Id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS BudgetEnvelopes (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Month TEXT NOT NULL,
                    CategoryId INTEGER NOT NULL,
                    TargetAmount REAL NOT NULL,
                    UNIQUE(Month, CategoryId),
                    FOREIGN KEY (CategoryId) REFERENCES BudgetCategories(Id)
                );

                CREATE TABLE IF NOT EXISTS BudgetGoals (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    TargetAmount REAL NOT NULL,
                    CurrentAmount REAL NOT NULL DEFAULT 0,
                    TargetDate TEXT,
                    CategoryId INTEGER,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (CategoryId) REFERENCES BudgetCategories(Id)
                );

                CREATE TABLE IF NOT EXISTS BudgetIncomePlan (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Month TEXT NOT NULL UNIQUE,
                    PlannedAmount REAL NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS BudgetRecurring (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Amount REAL NOT NULL,
                    AmountInput TEXT,
                    CategoryId INTEGER,
                    SpentByUserId INTEGER NOT NULL DEFAULT 0,
                    Cadence TEXT NOT NULL DEFAULT 'monthly',
                    NextRunDate TEXT NOT NULL,
                    Note TEXT,
                    Merchant TEXT,
                    Type TEXT NOT NULL DEFAULT 'expense',
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    AccountId INTEGER,
                    FOREIGN KEY (CategoryId) REFERENCES BudgetCategories(Id)
                );

                CREATE TABLE IF NOT EXISTS BudgetBills (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    AmountEstimate REAL NOT NULL DEFAULT 0,
                    DueDay INTEGER NOT NULL DEFAULT 1,
                    CategoryId INTEGER,
                    CalendarItemId INTEGER,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY (CategoryId) REFERENCES BudgetCategories(Id)
                );

                CREATE TABLE IF NOT EXISTS BudgetAuditLog (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    EntityType TEXT NOT NULL,
                    EntityId INTEGER NOT NULL,
                    ActorUserId INTEGER NOT NULL,
                    Action TEXT NOT NULL,
                    DataJson TEXT,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS BudgetExchangeRates (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    FromCurrency TEXT NOT NULL,
                    ToCurrency TEXT NOT NULL,
                    Rate REAL NOT NULL,
                    EffectiveDate TEXT NOT NULL,
                    UNIQUE(FromCurrency, ToCurrency, EffectiveDate)
                );

                CREATE TABLE IF NOT EXISTS BudgetNotificationLog (
                    NotificationKey TEXT PRIMARY KEY,
                    LastSentAt TEXT NOT NULL
                );
            ");

            using var seed = conn.CreateCommand();
            seed.CommandText = "SELECT COUNT(*) FROM BudgetAccounts";
            var count = Convert.ToInt64(seed.ExecuteScalar() ?? 0L);
            if (count == 0)
            {
                SchemaMigrationRunner.Execute(conn, @"
                    INSERT INTO BudgetAccounts (Name, AccountType, Currency, CurrentBalance)
                    VALUES ('Household', 'checking', 'USD', 0);
                ");
            }
        }),

        new SchemaMigrationRunner.Migration("003_budget_accounts_is_active", conn =>
        {
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE BudgetAccounts ADD COLUMN IsActive INTEGER NOT NULL DEFAULT 1");
        }),

        new SchemaMigrationRunner.Migration("004_budget_notification_dismissals", conn =>
        {
            SchemaMigrationRunner.Execute(conn, @"
                CREATE TABLE IF NOT EXISTS BudgetNotificationDismissals (
                    NotificationKey TEXT PRIMARY KEY,
                    DismissedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            ");
        }),

        new SchemaMigrationRunner.Migration("005_medium_features", conn =>
        {
            SchemaMigrationRunner.Execute(conn, @"
                CREATE TABLE IF NOT EXISTS WebInviteTokens (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    TokenHash TEXT NOT NULL UNIQUE,
                    Label TEXT,
                    CreatedAt TEXT NOT NULL,
                    ExpiresAt TEXT,
                    RevokedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS BuyRecurringItems (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Quantity TEXT,
                    Store TEXT,
                    AssignedTo INTEGER,
                    Tags TEXT,
                    Notes TEXT,
                    Cadence TEXT NOT NULL DEFAULT 'weekly',
                    NextDueDate TEXT NOT NULL,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    CreatedBy INTEGER,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS BudgetCategorizeRules (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    MatchField TEXT NOT NULL DEFAULT 'merchant',
                    MatchContains TEXT NOT NULL,
                    CategoryId INTEGER NOT NULL,
                    Priority INTEGER NOT NULL DEFAULT 0,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY (CategoryId) REFERENCES BudgetCategories(Id)
                );
            ");
        }),

        new SchemaMigrationRunner.Migration("006_polish_meals_gcal_ops", conn =>
        {
            SchemaMigrationRunner.Execute(conn, @"
                CREATE TABLE IF NOT EXISTS HouseholdAuditLog (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Category TEXT NOT NULL,
                    Action TEXT NOT NULL,
                    ActorUserId INTEGER,
                    ActorUsername TEXT,
                    Detail TEXT,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS NotificationPreferences (
                    DiscordUserId TEXT PRIMARY KEY,
                    BudgetAlerts INTEGER NOT NULL DEFAULT 1,
                    CalendarDm INTEGER NOT NULL DEFAULT 1,
                    WeeklyDigest INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS MealRecipes (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Description TEXT,
                    IngredientsJson TEXT NOT NULL DEFAULT '[]',
                    Instructions TEXT,
                    Servings INTEGER NOT NULL DEFAULT 4,
                    Tags TEXT,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS MealPlanEntries (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    PlanDate TEXT NOT NULL,
                    MealSlot TEXT NOT NULL,
                    RecipeId INTEGER,
                    CustomLabel TEXT,
                    Notes TEXT,
                    FOREIGN KEY (RecipeId) REFERENCES MealRecipes(Id)
                );

                CREATE INDEX IF NOT EXISTS IX_MealPlanEntries_Date ON MealPlanEntries(PlanDate);

                CREATE TABLE IF NOT EXISTS GoogleCalendarConnections (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DiscordUserId TEXT NOT NULL UNIQUE,
                    RefreshToken TEXT NOT NULL,
                    CalendarId TEXT NOT NULL DEFAULT 'primary',
                    SyncToken TEXT,
                    LastSyncAt TEXT,
                    LastSyncError TEXT,
                    IsActive INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS CalendarExternalLinks (
                    CalendarItemId INTEGER NOT NULL,
                    Provider TEXT NOT NULL,
                    ExternalId TEXT NOT NULL,
                    ETag TEXT,
                    UpdatedAt TEXT,
                    PendingPush INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (CalendarItemId, Provider),
                    FOREIGN KEY (CalendarItemId) REFERENCES CalendarItems(Id)
                );

                CREATE UNIQUE INDEX IF NOT EXISTS IX_CalendarExternalLinks_ProviderExt
                    ON CalendarExternalLinks(Provider, ExternalId);
            ");
        }),

        new SchemaMigrationRunner.Migration("007_gcal_followups_meals_calendar", conn =>
        {
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE CalendarExternalLinks ADD COLUMN GoogleUpdatedAt TEXT");
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE MealPlanEntries ADD COLUMN CalendarItemId INTEGER");

            SchemaMigrationRunner.Execute(conn, @"
                CREATE TABLE IF NOT EXISTS GoogleCalendarPendingDeletes (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ConnectionId INTEGER NOT NULL,
                    CalendarId TEXT NOT NULL,
                    ExternalId TEXT NOT NULL,
                    QueuedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            ");
        }),

        new SchemaMigrationRunner.Migration("008_push_subscriptions", conn =>
        {
            SchemaMigrationRunner.Execute(conn, @"
                CREATE TABLE IF NOT EXISTS PushSubscriptions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DiscordUserId TEXT NOT NULL,
                    Endpoint TEXT NOT NULL UNIQUE,
                    P256dh TEXT NOT NULL,
                    Auth TEXT NOT NULL,
                    CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS IX_PushSubscriptions_DiscordUserId
                    ON PushSubscriptions(DiscordUserId);
            ");
        }),

        new SchemaMigrationRunner.Migration("009_polish_receipt_bulk", conn =>
        {
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE BudgetTransactions ADD COLUMN ReceiptUrl TEXT");
        }),

        new SchemaMigrationRunner.Migration("010_budget_p2", conn =>
        {
            SchemaMigrationRunner.TryAddColumn(conn,
                "ALTER TABLE BudgetEnvelopes ADD COLUMN LeaveAmount REAL NOT NULL DEFAULT 0");
            SchemaMigrationRunner.Execute(conn, @"
                CREATE TABLE IF NOT EXISTS BudgetMonthNotes (
                    Month TEXT PRIMARY KEY,
                    Note TEXT NOT NULL DEFAULT '',
                    ClosedAt TEXT,
                    ClosedBy INTEGER
                );
                CREATE TABLE IF NOT EXISTS BudgetBillSkips (
                    BillId INTEGER NOT NULL,
                    Month TEXT NOT NULL,
                    SkippedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ActorUserId INTEGER,
                    PRIMARY KEY (BillId, Month),
                    FOREIGN KEY (BillId) REFERENCES BudgetBills(Id)
                );
            ");
        }),
    };
}
