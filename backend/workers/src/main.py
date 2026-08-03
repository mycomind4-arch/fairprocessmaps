"""Temporal worker entrypoint.

Registers workflow and activity definitions with the Temporal server.
"""
import asyncio

from temporalio.client import Client
from temporalio.worker import Worker

from src.config import settings
from src.logging_config import setup_logging
from src.pipelines.ingestion_workflow import IngestionWorkflow
from src.pipelines.due_process_workflow import DueProcessWorkflow
from src.pipelines.ingestion_activities import ingest_document
from src.pipelines.due_process_activities import analyze_due_process


async def main():
    log = setup_logging(level=settings.LOG_LEVEL)
    log.info("worker_starting", temporal_host=settings.TEMPORAL_HOST)

    client = await Client.connect(settings.TEMPORAL_HOST)

    worker = Worker(
        client,
        task_queue="fairprocess-tasks",
        workflows=[IngestionWorkflow, DueProcessWorkflow],
        activities=[ingest_document, analyze_due_process],
    )

    log.info("worker_started", task_queue="fairprocess-tasks")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
