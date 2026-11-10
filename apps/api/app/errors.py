"""Format kesalahan seragam: {"error": {"code", "message", "details"}}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: object = None):
        self.status, self.code, self.message, self.details = status, code, message, details


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse({"error": {"code": e.code, "message": e.message, "details": e.details}}, status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, e: RequestValidationError):
        details = [{"loc": list(x.get("loc", [])), "msg": x.get("msg")} for x in e.errors()]
        return JSONResponse({"error": {"code": "VALIDATION_ERROR", "message": "Data tidak valid", "details": details}}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return JSONResponse({"error": {"code": "HTTP_ERROR", "message": str(e.detail)}}, status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _any(_: Request, e: Exception):  # jangan bocorkan detail internal ke klien
        import logging
        logging.getLogger("tanda").exception("Unhandled error")
        return JSONResponse({"error": {"code": "INTERNAL", "message": "Terjadi kesalahan di server"}}, status_code=500)
