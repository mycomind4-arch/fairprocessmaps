"""Temporal workflow for due-process analysis."""
from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from src.pipelines.due_process_activities import analyze_due_process


@workflow.defn
class DueProcessWorkflow:
    """Durable workflow for running due-process analysis on a property."""

    @workflow.run
    async def run(self, property_id: str) -> dict:
        result = await workflow.execute_activity(
            analyze_due_process,
            args=(property_id,),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(
                maximum_attempts=3,
                initial_interval=timedelta(seconds=5),
            ),
        )
        return result
