/// <summary>
/// Generic validation helpers reused by command modules.
/// </summary>
public static class Validation
{
    /// <summary>
    /// Validates item names.
    /// </summary>
    public static string? ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "Name cannot be empty.";

        if (name.Length > 100)
            return "Name is too long (max 100 characters).";

        return null;
    }

    /// <summary>
    /// Validates quantity text values.
    /// </summary>
    public static string? ValidateQuantity(string quantity)
    {
        if (quantity.Length > 50)
            return "Quantity is too long (max 50 characters).";

        return null;
    }

    /// <summary>
    /// Validates store names.
    /// </summary>
    public static string? ValidateStore(string store)
    {
        if (store.Length > 50)
            return "Store name is too long (max 50 characters).";

        return null;
    }

    /// <summary>
    /// Validates serialized tag text.
    /// </summary>
    public static string? ValidateTags(string tags)
    {
        if (tags.Length > 100)
            return "Tags are too long (max 100 characters).";

        return null;
    }

    /// <summary>
    /// Validates notes length.
    /// </summary>
    public static string? ValidateNotes(string notes)
    {
        if (notes.Length > 200)
            return "Notes are too long (max 200 characters).";

        return null;
    }

    /// <summary>
    /// Validates positive identifier values.
    /// </summary>
    public static string? ValidateId(int id)
    {
        if (id <= 0)
            return "Invalid ID.";

        return null;
    }
}