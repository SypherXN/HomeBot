using System.Text.Json;
using System.Text.Json.Serialization;

/// <summary>
/// Reads Discord snowflakes from JSON numbers or digit strings so JavaScript clients can send
/// full 64-bit ids without IEEE-754 rounding (unsafe integers in JS). Used on public API DTOs,
/// request bodies, and undo payloads stored in <c>ActionLog</c> so persisted JSON prefers digit strings.
/// </summary>
public sealed class SnowflakeUlongJsonConverter : JsonConverter<ulong>
{
    public override ulong Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return reader.TokenType switch
        {
            JsonTokenType.String => ulong.TryParse(reader.GetString(), out var u) ? u : 0UL,
            JsonTokenType.Number => reader.TryGetUInt64(out var n) ? n : 0UL,
            _ => 0UL,
        };
    }

    public override void Write(Utf8JsonWriter writer, ulong value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString());
}
