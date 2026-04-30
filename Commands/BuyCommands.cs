using Discord;
using Discord.Interactions;
using Discord.WebSocket;

/// <summary>
/// Slash commands for managing shared buy list items.
/// </summary>
public class BuyCommands : InteractionModuleBase<SocketInteractionContext>
{
    private readonly BuyService _buyService;

    public BuyCommands(BuyService buyService)
    {
        _buyService = buyService;
    }

    /// <summary>
    /// Adds an item to the buy list after validating and normalizing inputs.
    /// </summary>
    [SlashCommand("buy-add", "Add item to buy list")]
    public async Task Add(
        [Summary("name", "Item name")] string name,
        [Summary("quantity", "Quantity")] string quantity = "",
        [Summary("store", "Store")] string store = "",
        [Summary("assignedTo", "Assigned user")] IUser? assignedTo = null,
        [Summary("tags", "Tags (comma separated)")] string tags = "",
        [Summary("notes", "Notes")] string notes = "")
    {

        // Validation
        var error =
            Validation.ValidateName(name) ??
            Validation.ValidateQuantity(quantity) ??
            Validation.ValidateStore(store) ??
            Validation.ValidateTags(tags) ??
            Validation.ValidateNotes(notes);

        if (error != null)
        {
            await RespondAsync($"❌ {error}", ephemeral: true);
            return;
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            await RespondAsync("❌ Name is required.");
            return;
        }

        _buyService.AddItem(
            name,
            quantity,
            store,
            assignedTo?.Id,
            tags,
            notes,
            Context.User.Id
        );

        await RespondAsync($"✅ Added: {name}");
    }

    /// <summary>
    /// Lists buy items with optional filters and sorting.
    /// </summary>
    [SlashCommand("buy-list", "List items with optional filters")]
    public async Task List(
        IUser? assignedTo = null,
        string store = "",
        string tag = "",
        string sort = "")
    {

        var (embed, components) = await _buyService.BuildBuyList(
            assignedTo?.Id,
            store,
            tag,
            sort
        );

        await RespondAsync(embed: embed, components: components);
    }

    /// <summary>
    /// Marks a buy list item as completed.
    /// </summary>
    [SlashCommand("buy-complete", "Mark an item as completed")]
    public async Task Complete(int id)
    {

        var idError = Validation.ValidateId(id);
        if (idError != null)
        {
            await RespondAsync($"❌ {idError}", ephemeral: true);
            return;
        }

        _buyService.CompleteItem(id, Context.User.Id);

        var (embed, components) = await _buyService.BuildBuyList();

        await RespondAsync(
            embed: embed,
            components: components
        );
    }

    /// <summary>
    /// Deletes a buy list item by id.
    /// </summary>
    [SlashCommand("buy-delete", "Delete an item")]
    public async Task Delete(int id)
    {

        var idError = Validation.ValidateId(id);
        if (idError != null)
        {
            await RespondAsync($"❌ {idError}", ephemeral: true);
            return;
        }

        _buyService.DeleteItem(id, Context.User.Id);

        var (embed, components) = await _buyService.BuildBuyList();

        await RespondAsync(embed: embed, components: components);
    }

    /// <summary>
    /// Deletes all completed buy list items.
    /// </summary>
    [SlashCommand("buy-clear-completed", "Clear all completed items")]
    public async Task ClearCompleted()
    {
        _buyService.ClearCompleted();

        await RespondAsync("🧹 Cleared completed items");
    }

    /// <summary>
    /// Updates selected fields on an existing buy item.
    /// </summary>
    [SlashCommand("buy-edit", "Edit an item")]
    public async Task Edit(
        int id,
        string name = "",
        string quantity = "",
        string store = "",
        IUser? assignedTo = null,
        string tags = "",
        string notes = "")
    {

        // Validation
        var idError = Validation.ValidateId(id);
        if (idError != null)
        {
            await RespondAsync($"❌ {idError}", ephemeral: true);
            return;
        }

        var error =
            (!string.IsNullOrWhiteSpace(name) ? Validation.ValidateName(name) : null) ??
            (!string.IsNullOrWhiteSpace(quantity) ? Validation.ValidateQuantity(quantity) : null) ??
            (!string.IsNullOrWhiteSpace(store) ? Validation.ValidateStore(store) : null) ??
            (!string.IsNullOrWhiteSpace(tags) ? Validation.ValidateTags(tags) : null) ??
            (!string.IsNullOrWhiteSpace(notes) ? Validation.ValidateNotes(notes) : null);

        if (error != null)
        {
            await RespondAsync($"❌ {error}", ephemeral: true);
            return;
        }

        if (!_buyService.EditItem(id, name, quantity, store, assignedTo?.Id, tags, notes))
        {
            await RespondAsync("Nothing to update.");
            return;
        }

        var (embed, components) = await _buyService.BuildBuyList();

        await RespondAsync(embed: embed, components: components);
    }
}