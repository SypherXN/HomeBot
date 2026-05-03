/// <summary>
/// Maps slash command names to feature keys for channel restrictions.
/// </summary>
public static class CommandFeatureMap
{
    /// <summary>
    /// Gets the feature key for a command, or null when unrestricted.
    /// </summary>
    public static string? GetFeature(string commandName)
    {
        return commandName switch
        {
            // --- BUY ---
            "buy-add" => "buy",
            "buy-list" => "buy",
            "buy-complete" => "buy",
            "buy-delete" => "buy",
            "buy-edit" => "buy",
            "buy-clear-completed" => "buy",

            // --- WISHLIST ---
            "wishlist-add" => "wishlist",
            "wishlist-list" => "wishlist",
            "wishlist-view" => "wishlist",
            "wishlist-complete" => "wishlist",
            "wishlist-delete" => "wishlist",
            "wishlist-clear-completed" => "wishlist",
            "wishlist-edit" => "wishlist",

            // --- MONEY ---
            "money-add" => "money",
            "money-pay" => "money",
            "money-summary" => "money",
            "money-list" => "money",
            "money-edit" => "money",
            "money-delete" => "money",

            // --- CALENDAR ---
            "calendar-add" => "calendar",
            "calendar-list" => "calendar",
            "calendar-view" => "calendar",
            "calendar-complete" => "calendar",
            "calendar-delete" => "calendar",
            "calendar-edit" => "calendar",
            "calendar-today" => "calendar",
            "calendar-upcoming" => "calendar",
            "calendar-instance-omit" => "calendar",
            "calendar-instance-complete" => "calendar",
            "calendar-instance-edit" => "calendar",

            // --- SYSTEM (no restriction) ---
            "setup-set" => null,
            "setup-view" => null,
            "config-set" => null,
            "config-view" => null,
            "timezone-set" => null,
            "timezone-list" => null,
            "undo" => null,
            "webui-verify" => null,

            _ => null
        };
    }
}