"""Lambda function: Generates S3 presigned PUT URL and validates storage quota."""

import os
import uuid
import datetime
from decimal import Decimal
from typing import Any, Dict
import boto3
from botocore.config import Config

from utils import (
    DOCUSTREAM_TABLE,
    S3_BUCKET_NAME,
    MAX_STORAGE_BYTES,
    MAX_FILE_BYTES,
    build_response,
    get_user_id,
    sanitize_filename,
    get_s3_client,
    get_dynamodb_resource,
)


def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Handles GET /api/upload-url requests.


    Query parameters:
    - fileName: Original document name (e.g., 'resume.pdf')
    - fileSize: File size in bytes (e.g., '1048576')
    - contentType: (Optional) MIME type (e.g., 'application/pdf')
    - userId: (Optional) User identifier
    """
    try:
        # Handle CORS preflight if routed here
        http_method = event.get("httpMethod") or (event.get("requestContext", {}).get("http", {}).get("method"))
        if http_method == "OPTIONS":
            return build_response(200, {"message": "CORS preflight OK"})

        query_params = event.get("queryStringParameters") or {}
        raw_file_name = query_params.get("fileName")
        raw_file_size = query_params.get("fileSize")
        content_type = query_params.get("contentType") or "application/octet-stream"
        user_id = get_user_id(event)

        if not raw_file_name:
            return build_response(400, {"error": "Missing required query parameter: fileName"})

        if not raw_file_size:
            return build_response(400, {"error": "Missing required query parameter: fileSize"})

        try:
            file_size = int(raw_file_size)
            if file_size <= 0:
                raise ValueError()
        except ValueError:
            return build_response(400, {"error": "Invalid fileSize parameter. Must be a positive integer."})

        # 1. Validate Single File Limit (20 MB default)
        if file_size > MAX_FILE_BYTES:
            max_mb = MAX_FILE_BYTES / (1024 * 1024)
            actual_mb = round(file_size / (1024 * 1024), 2)
            return build_response(
                400,
                {
                    "error": f"File size ({actual_mb} MB) exceeds maximum allowed file limit ({max_mb:.0f} MB).",
                    "maxFileBytes": MAX_FILE_BYTES,
                    "fileSizeBytes": file_size,
                },
            )

        # 2. Validate User Storage Quota (100 MB default)
        dynamodb = get_dynamodb_resource()
        s3_client = get_s3_client()

        table = dynamodb.Table(DOCUSTREAM_TABLE)
        user_pk = f"USER#{user_id}"
        metrics_sk = "METRICS#USAGE"

        metrics_response = table.get_item(
            Key={
                "partition_key": user_pk,
                "sort_key": metrics_sk,
            }
        )
        current_metrics = metrics_response.get("Item") or {}
        current_storage = int(current_metrics.get("total_storage_bytes", 0))
        max_quota = int(current_metrics.get("max_allowed_bytes", MAX_STORAGE_BYTES))

        if (current_storage + file_size) > max_quota:
            max_mb = max_quota / (1024 * 1024)
            current_mb = round(current_storage / (1024 * 1024), 2)
            file_mb = round(file_size / (1024 * 1024), 2)
            return build_response(
                400,
                {
                    "error": (
                        f"User storage quota exceeded. Total allowed: {max_mb:.0f} MB, "
                        f"Current used: {current_mb} MB, Upload size: {file_mb} MB."
                    ),
                    "totalStorageBytes": current_storage,
                    "maxAllowedBytes": max_quota,
                    "fileSizeBytes": file_size,
                },
            )

        # 3. Generate Doc ID and S3 Key
        doc_id = str(uuid.uuid4())
        clean_file_name = sanitize_filename(raw_file_name)
        s3_key = f"uploads/{user_id}/{doc_id}/{clean_file_name}"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # 4. Generate S3 Presigned PUT URL (15-minute expiration = 900 seconds)
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET_NAME,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=900,
        )

        # 5. Record Document in DynamoDB with PENDING_UPLOAD status
        doc_item = {
            "partition_key": user_pk,
            "sort_key": f"DOC#{doc_id}",
            "doc_id": doc_id,
            "user_id": user_id,
            "file_name": clean_file_name,
            "original_file_name": raw_file_name,
            "s3_key": s3_key,
            "s3_bucket": S3_BUCKET_NAME,
            "file_size_bytes": Decimal(str(file_size)),
            "content_type": content_type,
            "upload_timestamp": now_iso,
            "processing_status": "PENDING_UPLOAD",
            "extracted_text": "",
            "parsed_metadata": {
                "emails": [],
                "phones": [],
                "keywords": [],
            },
        }
        table.put_item(Item=doc_item)

        # Ensure metrics row is initialized if it didn't exist
        if not current_metrics:
            table.put_item(
                Item={
                    "partition_key": user_pk,
                    "sort_key": metrics_sk,
                    "user_id": user_id,
                    "total_storage_bytes": Decimal(0),
                    "max_allowed_bytes": Decimal(str(max_quota)),
                    "document_count": Decimal(0),
                    "updated_at": now_iso,
                }
            )

        return build_response(
            200,
            {
                "uploadUrl": presigned_url,
                "s3Key": s3_key,
                "docId": doc_id,
                "userId": user_id,
                "fileName": clean_file_name,
                "fileSizeBytes": file_size,
                "contentType": content_type,
                "expiresIn": 900,
            },
        )

    except Exception as exc:
        return build_response(500, {"error": f"Failed to generate upload URL: {str(exc)}"})
