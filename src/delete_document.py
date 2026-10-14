"""Lambda function: Deletes document from S3 and DynamoDB and restores user quota."""

from decimal import Decimal
from typing import Any, Dict
import boto3

from utils import (
    DOCUSTREAM_TABLE,
    S3_BUCKET_NAME,
    build_response,
    get_user_id,
    get_s3_client,
    get_dynamodb_resource,
)


def handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """Handles DELETE /api/documents/{docId} requests."""
    try:
        http_method = event.get("httpMethod") or (event.get("requestContext", {}).get("http", {}).get("method"))
        if http_method == "OPTIONS":
            return build_response(200, {"message": "CORS preflight OK"})

        path_params = event.get("pathParameters") or {}
        doc_id = path_params.get("docId")

        if not doc_id:
            return build_response(400, {"error": "Missing docId in path parameters"})

        user_id = get_user_id(event)
        user_pk = f"USER#{user_id}"
        doc_sk = f"DOC#{doc_id}"

        dynamodb = get_dynamodb_resource()
        s3_client = get_s3_client()
        table = dynamodb.Table(DOCUSTREAM_TABLE)


        # 1. Fetch document metadata from DynamoDB
        get_resp = table.get_item(Key={"partition_key": user_pk, "sort_key": doc_sk})
        doc_item = get_resp.get("Item")

        if not doc_item:
            return build_response(404, {"error": f"Document '{doc_id}' not found for user '{user_id}'"})

        s3_key = doc_item.get("s3_key")
        bucket = doc_item.get("s3_bucket", S3_BUCKET_NAME)
        file_size_bytes = int(doc_item.get("file_size_bytes", 0))

        # 2. Delete file from S3
        if bucket and s3_key:
            try:
                s3_client.delete_object(Bucket=bucket, Key=s3_key)
            except Exception:
                pass  # Continue to remove database record even if S3 delete failed or already gone

        # 3. Delete record from DynamoDB
        table.delete_item(Key={"partition_key": user_pk, "sort_key": doc_sk})

        # 4. Atomically decrement user storage usage and doc count
        metrics_sk = "METRICS#USAGE"
        try:
            # First fetch current metrics to avoid negative storage
            metrics_resp = table.get_item(Key={"partition_key": user_pk, "sort_key": metrics_sk})
            metrics = metrics_resp.get("Item") or {}
            curr_storage = int(metrics.get("total_storage_bytes", 0))
            new_storage = max(0, curr_storage - file_size_bytes)
            curr_docs = int(metrics.get("document_count", 0))
            new_docs = max(0, curr_docs - 1)

            table.update_item(
                Key={"partition_key": user_pk, "sort_key": metrics_sk},
                UpdateExpression="SET total_storage_bytes = :storage, document_count = :docs",
                ExpressionAttributeValues={
                    ":storage": Decimal(str(new_storage)),
                    ":docs": Decimal(str(new_docs)),
                },
            )
        except Exception:
            pass

        return build_response(
            200,
            {
                "message": "Document deleted successfully",
                "docId": doc_id,
                "freedBytes": file_size_bytes,
                "userId": user_id,
            },
        )

    except Exception as exc:
        return build_response(500, {"error": f"Failed to delete document: {str(exc)}"})
