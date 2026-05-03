using Discord;
using Discord.Interactions;

/// <summary>
/// Slash commands for tracking shared expenses, payments, and balances.
/// </summary>
public class MoneyCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly MoneyService _money;

    public MoneyCommands(MoneyService money)
    {
        _money = money;
    }

    /// <summary>
    /// Adds an expense split between two users by percentage.
    /// </summary>
    [SlashCommand("money-add", "Add expense")]
    public async Task Add(
        string name,
        string amount,
        IUser owed,
        int percent = 50,
        string description = "",
        string notes = "",
        IUser? paidBy = null)
    {
        var payer = paidBy ?? Context.User;

        percent = Math.Clamp(percent, 1, 100);

        _money.AddPercentageExpense(
            name,
            description,
            notes,
            amount,
            payer.Id,
            owed.Id,
            percent
        );

        await RespondAsync(
            $"💸 {name}: <@{owed.Id}> owes {percent}% of ${amount}"
        );
    }

    /// <summary>
    /// Records a payment from one user to another.
    /// </summary>
    [SlashCommand("money-pay", "Record payment")]
    public async Task Pay(
        string amount,
        IUser to,
        IUser? paidBy = null)
    {
        var payer = paidBy ?? Context.User;

        _money.AddPayment(
            amount,
            payer.Id,
            to.Id
        );

        await RespondAsync(
            $"💰 Payment recorded: ${amount}\n<@{payer.Id}> → <@{to.Id}>"
        );
    }

    /// <summary>
    /// Shows summary balances for overall, pair, or user-versus-user views.
    /// </summary>
    [SlashCommand("money-summary", "View balance")]
    public async Task Summary(
        IUser? user1 = null,
        IUser? user2 = null)
    {
        // --- CASE 1: No args → overall summary ---
        if (user1 == null && user2 == null)
        {
            var embed = await MoneyDiscordPresentation.BuildOverallSummary(
                _money,
                Context.User.Id,
                Context.User.Username
            );

            await RespondAsync(embed: embed);
            return;
        }

        ulong u1;
        ulong u2;
        string name1;
        string name2;

        // --- CASE 2: One user → you vs them ---
        if (user2 == null)
        {
            u1 = Context.User.Id;
            u2 = user1!.Id;

            name1 = Context.User.Username;
            name2 = user1.Username;
        }
        else
        {
            // --- CASE 3: explicit pair ---
            u1 = user1!.Id;
            u2 = user2.Id;

            name1 = user1.Username;
            name2 = user2.Username;
        }

        var embed2 = await MoneyDiscordPresentation.BuildSummary(_money, u1, u2, name1, name2);

        await RespondAsync(embed: embed2);
    }

    /// <summary>
    /// Displays paginated transaction history.
    /// </summary>
    [SlashCommand("money-list", "View transaction history")]
    public async Task List()
    {
        var (embed, components) = await MoneyDiscordPresentation.BuildTransactions(_money);

        await RespondAsync(embed: embed, components: components);
    }

    /// <summary>
    /// Updates editable fields on a transaction.
    /// </summary>
    [SlashCommand("money-edit", "Edit a transaction")]
    public async Task Edit(
        int id,
        string name = "",
        string description = "",
        string notes = "",
        string amount = "")
    {
        _money.EditTransaction(id, name, description, notes, amount);

        await RespondAsync("✏️ Transaction updated");
    }

    /// <summary>
    /// Deletes a transaction by id.
    /// </summary>
    [SlashCommand("money-delete", "Delete a transaction")]
    public async Task Delete(int id)
    {
        _money.DeleteTransaction(id, Context.User.Id);

        await RespondAsync("❌ Transaction deleted");
    }
}