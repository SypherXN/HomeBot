using System.Text.Json;
using System.Text.Json.Serialization;

/// <summary>
/// Nullable counterpart to <see cref="SnowflakeUlongJsonConverter"/>. Accepts JSON null,
/// digit strings, or numeric tokens so JavaScript clients can send full 64-bit Discord
/// snowflakes without IEEE-754 rounding for optional fields like <c>assignedToUserId</c>.
/// </summary>
public sealed class SnowflakeUlongNullableJsonConverter : JsonConverter<ulong?>
{
    public override ulong? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return reader.TokenType switch
        {
            JsonTokenType.Null => null,
            JsonTokenType.String => ulong.TryParse(reader.GetString(), out var u) ? u : null,
            JsonTokenType.Number => reader.TryGetUInt64(out var n) ? n : null,
            _ => null,
        };
    }

    public override void Write(Utf8JsonWriter writer, ulong? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
            writer.WriteStringValue(value.Value.ToString());
        else
            writer.WriteNullValue();
    }
}
