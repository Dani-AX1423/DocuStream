"""Lambda function: Fetches processed documents and user storage quota usage."""

from decimal import Decimal
from typing import Any, Dict, List
import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config

from utils import (
    DOCUSTREAM_TABLE,
    S3_BUCKET_NAME,
    MAX_STORAGE_BYTES,
    build_response,
    get_user_id,
    get_s3_client,
    get_dynamodb_resource,
)


def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Handles GET /api/documents?userId={id} requests."""
    try:
        http_method = event.get("httpMethod") or (event.get("requestContext", {}).get("http", {}).get("method"))
        if http_method == "OPTIONS":
            return build_response(200, {"message": "CORS preflight OK"})

        user_id = get_user_id(event)
        user_pk = f"USER#{user_id}"

        dynamodb = get_dynamodb_resource()
        s3_client = get_s3_client()
        table = dynamodb.Table(DOCUSTREAM_TABLE)


        response = table.query(
            KeyConditionExpression=Key("partition_key").eq(user_pk)
        )
        items = response.get("Items", [])

        documents: List[Dict[str, Any]] = []
        metrics_item: Dict[str, Any] = {}

        for item in items:
            sk = item.get("sort_key", "")
            if sk.startswith("DOC#"):
                # Generate temporary presigned download & view URLs (1 hour)
                s3_key = item.get("s3_key")
                download_url = None
                view_url = None
                if s3_key and S3_BUCKET_NAME:
                    try:
                        safe_filename = item.get("file_name", "document").replace('"', "")
                        # Direct download attachment (forces Save file prompt)
                        download_url = s3_client.generate_presigned_url(
                            "get_object",
                            Params={
                                "Bucket": S3_BUCKET_NAME,
                                "Key": s3_key,
                                "ResponseContentDisposition": f'attachment; filename="{safe_filename}"',
                            },
                            ExpiresIn=3600,
                        )
                        # Inline view URL (opens in new tab)
                        view_url = s3_client.generate_presigned_url(
                            "get_object",
                            Params={
                                "Bucket": S3_BUCKET_NAME,
                                "Key": s3_key,
                                "ResponseContentDisposition": f'inline; filename="{safe_filename}"',
                            },
                            ExpiresIn=3600,
                        )
                    except Exception:
                        download_url = None
                        view_url = None

                doc_entry = dict(item)
                doc_entry["downloadUrl"] = download_url
                doc_entry["viewUrl"] = view_url

                documents.append(doc_entry)
            elif sk == "METRICS#USAGE":
                metrics_item = item

        # Sort documents by upload_timestamp descending
        documents.sort(
            key=lambda d: str(d.get("upload_timestamp", "")),
            reverse=True,
        )

        # Quota calculations
        total_storage_bytes = int(metrics_item.get("total_storage_bytes", 0))
        max_allowed_bytes = int(metrics_item.get("max_allowed_bytes", MAX_STORAGE_BYTES))

        # Recalculate from actual documents if metrics item is not yet initialized
        if not metrics_item and documents:
            total_storage_bytes = sum(int(d.get("file_size_bytes", 0)) for d in documents if d.get("processing_status") != "FAILED")

        used_mb = round(total_storage_bytes / (1024 * 1024), 2)
        max_mb = round(max_allowed_bytes / (1024 * 1024), 2)
        usage_pct = round((total_storage_bytes / max_allowed_bytes) * 100, 2) if max_allowed_bytes > 0 else 0.0

        quota_info = {
            "userId": user_id,
            "totalStorageBytes": total_storage_bytes,
            "maxAllowedBytes": max_allowed_bytes,
            "usedMb": used_mb,
            "maxMb": max_mb,
            "usagePercentage": min(usage_pct, 100.0),
            "documentCount": len(documents),
        }

        return build_response(
            200,
            {
                "documents": documents,
                "quota": quota_info,
                "count": len(documents),
            },
        )

    except Exception as exc:
        return build_response(500, {"error": f"Failed to list documents: {str(exc)}"})
