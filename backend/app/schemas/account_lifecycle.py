from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictBool


class LifecycleAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=0, strict=True)
    action_id: UUID
    confirm: StrictBool
