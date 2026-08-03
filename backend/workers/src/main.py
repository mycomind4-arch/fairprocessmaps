"""Temporal worker entrypoint.

Registers workflow and activity definitions with the Temporal server.
"""
import asyncio
import os

from temporalio.client import Client
from temporalio.worker import Worker

from src.pipelines.ingestion_workflow import IngestionWorkflow, ingest_document
from src.pipelines.due_process_workflow import DueProcessWorkflow, analyze_due_process
from src.config import settings


async def main():
    client = await Client.connect(settings.TEMPORAL_HOST)

    worker = Worker(
        client,
        task_queue="fairprocess-tasks",
        workflows=[IngestionWorkflow, DueProcessWorkflow],
        activities=[ingest_document, analyze_due_process],
    )

    print(f"Worker started, connected to {settings.TEMPORAL_HOST}")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
