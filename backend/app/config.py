from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_name: str = "Tarmeem Leave Verification"
    environment: str = "development"
    secret_key: str
    frontend_origin: str = "http://localhost:3000"

    database_url: str = "sqlite:///./data/tarmeem.db"

    admin_email: str
    admin_password: str
    admin_name: str = "System Administrator"

    otp_ttl_seconds: int = 300
    otp_resend_cooldown_seconds: int = 30
    otp_max_attempts: int = 5
    otp_dev_mode: bool = True

    # Gmail (or any SMTP server). Used when SMTP_EMAIL and SMTP_PASSWORD are set.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_email: str = ""
    smtp_password: str = ""

    graph_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""
    graph_sender: str = ""

    access_token_minutes: int = 480
    cookie_secure: bool = False
    max_upload_mb: int = 10

    @property
    def graph_enabled(self) -> bool:
        return all([self.graph_tenant_id, self.graph_client_id, self.graph_client_secret, self.graph_sender])

    @property
    def smtp_enabled(self) -> bool:
        return all([self.smtp_host, self.smtp_email, self.smtp_password])

    @property
    def mail_enabled(self) -> bool:
        return self.smtp_enabled or self.graph_enabled

    @property
    def mail_description(self) -> str:
        if self.smtp_enabled:
            return f"SMTP {self.smtp_host}:{self.smtp_port} as {self.smtp_email}"
        return f"Microsoft Graph as {self.graph_sender}"

    @property
    def expose_dev_codes(self) -> bool:
        return self.otp_dev_mode and not self.mail_enabled

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url
        if url.startswith("sqlite:///./"):
            url = "sqlite:///" + (BASE_DIR / url[len("sqlite:///./"):]).as_posix()
        return url

    @property
    def upload_dir(self) -> Path:
        return BASE_DIR / "uploads"

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
