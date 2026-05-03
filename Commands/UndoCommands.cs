using Discord.Interactions;

/// <summary>
/// Provides undo support for recent actions across bot modules.
/// </summary>
public class UndoCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly UndoService _undo;
    private readonly MoneyService _money;

    public UndoCommands(UndoService undo, MoneyService money)
    {
        _undo = undo;
        _money = money;
    }

    /// <summary>
    /// Reverts the last undoable action for the current user.
    /// </summary>
    [SlashCommand("undo", "Undo last action")]
    public async Task Undo()
    {
        var result = _undo.ApplyLastUndo(Context.User.Id);

        if (result.IsNothingToUndo)
        {
            await RespondAsync(result.Message ?? "Nothing to undo.");
            return;
        }

        if (!result.IsSuccess)
        {
            await RespondAsync(result.Message ?? "❌ Undo failed.");
            return;
        }

        var ui = await MoneyDiscordPresentation.BuildTransactions(_money);
        await RespondAsync(embed: ui.embed, components: ui.components);
    }
}
