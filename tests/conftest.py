"""Pytest fixtures for DocuStream Web backend testing with Moto."""

import os
import sys
import pytest
import boto3
from moto import mock_aws

# Add src directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

TABLE_NAME = "DocuStreamData"
BUCKET_NAME = "docustream-test-bucket"


@pytest.fixture(autouse=True)
def aws_credentials():
    """Mocked AWS Credentials for moto."""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
    os.environ["DOCUSTREAM_TABLE"] = TABLE_NAME
    os.environ["S3_BUCKET_NAME"] = BUCKET_NAME
    os.environ["MAX_STORAGE_BYTES"] = "104857600"  # 100 MB
    os.environ["MAX_FILE_BYTES"] = "20971520"     # 20 MB


@pytest.fixture
def dynamodb_table(aws_credentials):
    """Creates a mock DynamoDB table matching template.yaml schema."""
    with mock_aws():
        client = boto3.client("dynamodb", region_name="us-east-1")
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "partition_key", "KeyType": "HASH"},
                {"AttributeName": "sort_key", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "partition_key", "AttributeType": "S"},
                {"AttributeName": "sort_key", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield boto3.resource("dynamodb", region_name="us-east-1").Table(TABLE_NAME)


@pytest.fixture
def s3_bucket(aws_credentials):
    """Creates a mock S3 bucket matching template.yaml."""
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET_NAME)
        yield client
