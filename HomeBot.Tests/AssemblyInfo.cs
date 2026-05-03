using Xunit;

// HOMEBOT_WEB_JWT_SECRET is process-global; several fixtures mutate it. Run tests sequentially
// so one test cannot clear or starve another mid-await.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
