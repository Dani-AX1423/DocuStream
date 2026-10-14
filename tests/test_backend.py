"""Unit tests for DocuStream Web Lambda backend functions.

Mocks AWS S3, DynamoDB, and Textract with Moto and unittest.mock.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from decimal import Decimal
from moto import mock_aws
import boto3

import get_presigned_url
import process_document
import list_documents
import delete_document
import utils


# ==============================================================================
# 1. TEST UTILITIES & REGEX
# ==============================================================================
def test_regex_extraction():
    sample_text = """
    Contact Dr. Jane Doe at jane.doe@example.com or support@docustream.io.
    Direct line: +1 (555) 234-5678, Office: 415-555-0199 or +44 20 7946 0919.
    Invalid: 1234, info@test
    """
    matches = process_document.extract_regex_matches(sample_text)
    assert "jane.doe@example.com" in matches["emails"]
    assert "support@docustream.io" in matches["emails"]
    assert len(matches["emails"]) == 2

    # Check phones
    assert any("234-5678" in p for p in matches["phones"])
    assert any("415-555-0199" in p for p in matches["phones"])


def test_keyword_extraction():
    text = "Machine learning architecture for automated serverless document processing and natural language indexing."
    keywords = utils.extract_keywords(text)
    assert "machine" in keywords
    assert "learning" in keywords
    assert "serverless" in keywords
    assert "the" not in keywords
    assert "for" not in keywords


# ==============================================================================
# 2. TEST GET_PRESIGNED_URL
# ==============================================================================
@mock_aws
def test_get_presigned_url_success():
    # Setup S3 & DynamoDB
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="docustream-test-bucket")
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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

    event = {
        "httpMethod": "GET",
        "queryStringParameters": {
            "fileName": "sample_invoice.pdf",
            "fileSize": "5242880",  # 5 MB
            "contentType": "application/pdf",
            "userId": "user-123",
        },
    }

    resp = get_presigned_url.handler(event, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert "uploadUrl" in body
    assert body["userId"] == "user-123"
    assert body["fileName"] == "sample_invoice.pdf"
    assert body["s3Key"].startswith("uploads/user-123/")

    # Verify pending document in DynamoDB
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("DocuStreamData")
    item = table.get_item(
        Key={"partition_key": "USER#user-123", "sort_key": f"DOC#{body['docId']}"}
    ).get("Item")
    assert item is not None
    assert item["processing_status"] == "PENDING_UPLOAD"
    assert int(item["file_size_bytes"]) == 5242880


@mock_aws
def test_get_presigned_url_file_size_exceeded():
    event = {
        "httpMethod": "GET",
        "queryStringParameters": {
            "fileName": "huge_dataset.zip",
            "fileSize": "25000000",  # ~23.8 MB (> 20 MB)
            "userId": "user-123",
        },
    }
    resp = get_presigned_url.handler(event, None)
    assert resp["statusCode"] == 400
    body = json.loads(resp["body"])
    assert "exceeds maximum allowed file limit" in body["error"]


@mock_aws
def test_get_presigned_url_storage_quota_exceeded():
    # Setup DynamoDB with existing 98 MB usage
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("DocuStreamData")
    table.put_item(
        Item={
            "partition_key": "USER#user-quota-test",
            "sort_key": "METRICS#USAGE",
            "total_storage_bytes": Decimal(100_000_000),  # 100 MB already used
            "max_allowed_bytes": Decimal(104_857_600),
        }
    )

    event = {
        "httpMethod": "GET",
        "queryStringParameters": {
            "fileName": "overflow.pdf",
            "fileSize": "10000000",  # 10 MB, which would exceed 100 MB
            "userId": "user-quota-test",
        },
    }
    resp = get_presigned_url.handler(event, None)
    assert resp["statusCode"] == 400
    body = json.loads(resp["body"])
    assert "User storage quota exceeded" in body["error"]


# ==============================================================================
# 3. TEST PROCESS_DOCUMENT
# ==============================================================================
@mock_aws
def test_process_document_success():
    # Setup S3
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="docustream-test-bucket")
    file_content = b"Mock document content"
    s3_key = "uploads/user-456/doc-999/resume.pdf"
    s3.put_object(
        Bucket="docustream-test-bucket",
        Key=s3_key,
        Body=file_content,
        ContentType="application/pdf",
    )

    # Setup DynamoDB
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("DocuStreamData")
    table.put_item(
        Item={
            "partition_key": "USER#user-456",
            "sort_key": "DOC#doc-999",
            "doc_id": "doc-999",
            "user_id": "user-456",
            "file_name": "resume.pdf",
            "processing_status": "PENDING_UPLOAD",
        }
    )

    # Mock Textract response
    mock_textract = MagicMock()
    mock_textract.detect_document_text.return_value = {
        "Blocks": [
            {"BlockType": "PAGE", "Id": "1"},
            {"BlockType": "LINE", "Text": "Alex Morgan - Senior Cloud Architect"},
            {"BlockType": "LINE", "Text": "Email: alex.morgan@cloudtech.com"},
            {"BlockType": "LINE", "Text": "Phone: +1 415-555-7890"},
            {"BlockType": "LINE", "Text": "Skills: Python, TypeScript, AWS Textract, Serverless"},
        ]
    }

    with patch.object(process_document, "textract_client", mock_textract):
        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "docustream-test-bucket"},
                        "object": {"key": s3_key, "size": len(file_content)},
                    }
                }
            ]
        }
        result = process_document.handler(event, None)
        assert result["status"] == "SUCCESS"
        assert result["processedCount"] == 1

        # Verify DynamoDB record updated to PROCESSED
        doc_item = table.get_item(
            Key={"partition_key": "USER#user-456", "sort_key": "DOC#doc-999"}
        )["Item"]
        assert doc_item["processing_status"] == "PROCESSED"
        assert "alex.morgan@cloudtech.com" in doc_item["parsed_metadata"]["emails"]
        assert any("415-555-7890" in p for p in doc_item["parsed_metadata"]["phones"])
        assert "python" in doc_item["parsed_metadata"]["keywords"]

        # Verify metrics updated
        metrics = table.get_item(
            Key={"partition_key": "USER#user-456", "sort_key": "METRICS#USAGE"}
        )["Item"]
        assert int(metrics["total_storage_bytes"]) == len(file_content)
        assert int(metrics["document_count"]) == 1


@mock_aws
def test_process_document_textract_failure():
    # Setup DynamoDB
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("DocuStreamData")
    table.put_item(
        Item={
            "partition_key": "USER#user-err",
            "sort_key": "DOC#doc-err",
            "doc_id": "doc-err",
            "user_id": "user-err",
            "file_name": "corrupt.pdf",
            "processing_status": "PENDING_UPLOAD",
        }
    )

    mock_textract = MagicMock()
    mock_textract.detect_document_text.side_effect = Exception("UnsupportedDocumentException: Corrupt file")

    with patch.object(process_document, "textract_client", mock_textract):
        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "docustream-test-bucket"},
                        "object": {"key": "uploads/user-err/doc-err/corrupt.pdf", "size": 100},
                    }
                }
            ]
        }
        result = process_document.handler(event, None)
        assert result["results"][0]["status"] == "FAILED"

        # Check item marked as FAILED in DynamoDB
        item = table.get_item(
            Key={"partition_key": "USER#user-err", "sort_key": "DOC#doc-err"}
        )["Item"]
        assert item["processing_status"] == "FAILED"
        assert "UnsupportedDocumentException" in item["error_message"]


@mock_aws
def test_process_document_subscription_required_fallback():
    # Setup S3
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="docustream-test-bucket")
    content = b"Candidate Email: fallback.user@test.org Phone: +1 415-555-4321 Invoice #1234"
    s3_key = "uploads/user-sub/doc-sub-1/receipt.jpeg"
    s3.put_object(Bucket="docustream-test-bucket", Key=s3_key, Body=content)

    # Setup DynamoDB
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("DocuStreamData")
    table.put_item(
        Item={
            "partition_key": "USER#user-sub",
            "sort_key": "DOC#doc-sub-1",
            "doc_id": "doc-sub-1",
            "user_id": "user-sub",
            "file_name": "receipt.jpeg",
            "processing_status": "PENDING_UPLOAD",
        }
    )

    # Simulate SubscriptionRequiredException from Textract
    mock_textract = MagicMock()
    mock_textract.detect_document_text.side_effect = Exception(
        "SubscriptionRequiredException: The AWS Access Key Id needs a subscription for the service"
    )

    with patch.object(process_document, "textract_client", mock_textract):
        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "docustream-test-bucket"},
                        "object": {"key": s3_key, "size": len(content)},
                    }
                }
            ]
        }
        result = process_document.handler(event, None)
        assert result["results"][0]["status"] == "PROCESSED"

        # Verify DynamoDB item status is PROCESSED and fallback metadata was extracted
        item = table.get_item(
            Key={"partition_key": "USER#user-sub", "sort_key": "DOC#doc-sub-1"}
        )["Item"]
        assert item["processing_status"] == "PROCESSED"
        assert "fallback.user@test.org" in item["parsed_metadata"]["emails"]
        assert any("415-555-4321" in p for p in item["parsed_metadata"]["phones"])
        assert "Notice: AWS Textract subscription pending" in item["extracted_text"]



# ==============================================================================
# 4. TEST LIST_DOCUMENTS
# ==============================================================================
@mock_aws
def test_list_documents():
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("DocuStreamData")

    # Seed 2 documents and metrics
    table.put_item(
        Item={
            "partition_key": "USER#user-list",
            "sort_key": "DOC#doc-1",
            "doc_id": "doc-1",
            "file_name": "doc1.pdf",
            "file_size_bytes": Decimal(1048576),  # 1 MB
            "upload_timestamp": "2026-10-14T08:00:00Z",
            "processing_status": "PROCESSED",
            "extracted_text": "Sample text 1",
            "parsed_metadata": {"emails": [], "phones": [], "keywords": []},
        }
    )
    table.put_item(
        Item={
            "partition_key": "USER#user-list",
            "sort_key": "DOC#doc-2",
            "doc_id": "doc-2",
            "file_name": "doc2.png",
            "file_size_bytes": Decimal(2097152),  # 2 MB
            "upload_timestamp": "2026-10-14T08:10:00Z",
            "processing_status": "PROCESSED",
            "extracted_text": "Sample text 2",
            "parsed_metadata": {"emails": [], "phones": [], "keywords": []},
        }
    )
    table.put_item(
        Item={
            "partition_key": "USER#user-list",
            "sort_key": "METRICS#USAGE",
            "total_storage_bytes": Decimal(3145728),  # 3 MB
            "max_allowed_bytes": Decimal(104857600),   # 100 MB
            "document_count": Decimal(2),
        }
    )

    event = {
        "httpMethod": "GET",
        "queryStringParameters": {"userId": "user-list"},
    }
    resp = list_documents.handler(event, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["count"] == 2
    assert len(body["documents"]) == 2
    assert body["quota"]["totalStorageBytes"] == 3145728
    assert body["quota"]["usedMb"] == 3.0
    assert body["quota"]["usagePercentage"] == 3.0


# ==============================================================================
# 5. TEST DELETE_DOCUMENT
# ==============================================================================
@mock_aws
def test_delete_document_success():
    # Setup S3
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="docustream-test-bucket")
    s3_key = "uploads/user-del/doc-del-1/contract.pdf"
    s3.put_object(Bucket="docustream-test-bucket", Key=s3_key, Body=b"Contract text")

    # Setup DynamoDB
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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
    table = boto3.resource("dynamodb", region_name="us-east-1").Table("DocuStreamData")

    file_size = 5000000
    table.put_item(
        Item={
            "partition_key": "USER#user-del",
            "sort_key": "DOC#doc-del-1",
            "doc_id": "doc-del-1",
            "user_id": "user-del",
            "file_name": "contract.pdf",
            "s3_key": s3_key,
            "s3_bucket": "docustream-test-bucket",
            "file_size_bytes": Decimal(file_size),
        }
    )
    table.put_item(
        Item={
            "partition_key": "USER#user-del",
            "sort_key": "METRICS#USAGE",
            "total_storage_bytes": Decimal(file_size),
            "document_count": Decimal(1),
            "max_allowed_bytes": Decimal(104857600),
        }
    )

    event = {
        "httpMethod": "DELETE",
        "pathParameters": {"docId": "doc-del-1"},
        "queryStringParameters": {"userId": "user-del"},
    }

    resp = delete_document.handler(event, None)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["docId"] == "doc-del-1"
    assert body["freedBytes"] == file_size

    # Verify item deleted from DynamoDB
    get_res = table.get_item(Key={"partition_key": "USER#user-del", "sort_key": "DOC#doc-del-1"})
    assert "Item" not in get_res

    # Verify quota decremented to 0
    metrics = table.get_item(Key={"partition_key": "USER#user-del", "sort_key": "METRICS#USAGE"})["Item"]
    assert int(metrics["total_storage_bytes"]) == 0
    assert int(metrics["document_count"]) == 0


@mock_aws
def test_delete_document_not_found():
    dynamo = boto3.client("dynamodb", region_name="us-east-1")
    dynamo.create_table(
        TableName="DocuStreamData",
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

    event = {
        "httpMethod": "DELETE",
        "pathParameters": {"docId": "non-existent-doc"},
        "queryStringParameters": {"userId": "user-del"},
    }

    resp = delete_document.handler(event, None)
    assert resp["statusCode"] == 404
