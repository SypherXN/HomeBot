using Xunit;

namespace HomeBot.Tests;

public sealed class CommandFeatureMapTests
{
    [Theory]
    [InlineData("budget-add", "budget")]
    [InlineData("budget-summary", "budget")]
    [InlineData("budget-digest", "budget")]
    [InlineData("budget-list", "budget")]
    public void Budget_commands_map_to_budget_feature(string command, string expected)
    {
        Assert.Equal(expected, CommandFeatureMap.GetFeature(command));
    }

    [Fact]
    public void Meal_commands_are_unrestricted()
    {
        Assert.Null(CommandFeatureMap.GetFeature("meal-plan"));
        Assert.Null(CommandFeatureMap.GetFeature("meal-dinner"));
        Assert.Null(CommandFeatureMap.GetFeature("meal-add-recipe"));
    }

    [Fact]
    public void Setup_commands_remain_unrestricted()
    {
        Assert.Null(CommandFeatureMap.GetFeature("setup-set"));
        Assert.Null(CommandFeatureMap.GetFeature("undo"));
    }
}
