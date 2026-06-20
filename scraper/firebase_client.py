"""
firebase_client.py - Firestore read/write for the Python scraper.

Security rules (paste into Firebase Console):
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      // Public read for all collections
      match /{document=**} {
        allow read: if true;
        allow write: if false; // Only service account writes
      }
    }
  }
"""

import json
import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore


class FirebaseClient:
    _instance = None
    _db = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_firebase()
        return cls._instance

    def _init_firebase(self):
        """Initialize Firebase Admin SDK from environment variable."""
        try:
            from config import get_firebase_service_account
            service_account = get_firebase_service_account()
        except EnvironmentError:
            # Not set -- dry run or frontend-only mode
            self._db = None
            return
        except Exception as e:
            raise ValueError(f"Invalid FIREBASE_SERVICE_ACCOUNT: {e}")

        cred = credentials.Certificate(service_account)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)

        self._db = firestore.client()

    async def upsert_vehicle(self, vehicle: dict):
        """Write a vehicle document to Firestore."""
        if not self._db:
            print("  [FirebaseClient] No Firestore connection -- skipping write")
            return
        vehicle_id = vehicle.get("id")
        if not vehicle_id:
            raise ValueError("Vehicle must have an 'id' field")
        vehicle["lastUpdated"] = datetime.now(timezone.utc).isoformat()
        doc_ref = self._db.collection("vehicles").document(vehicle_id)
        doc_ref.set(vehicle, merge=True)
        print(f"  Firestore: vehicles/{vehicle_id}")

    async def get_all_vehicles(self) -> list[dict]:
        """Fetch all vehicle documents from Firestore."""
        if not self._db:
            return []
        docs = self._db.collection("vehicles").stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]

    async def upsert_state_data(self, state_abbr: str, data: dict):
        """Write state incentive/fee data."""
        if not self._db:
            return
        doc_ref = self._db.collection("state_data").document(state_abbr.upper())
        doc_ref.set(data, merge=True)

    async def get_state_data(self, state_abbr: str) -> dict | None:
        """Fetch state data document."""
        if not self._db:
            return None
        doc = self._db.collection("state_data").document(state_abbr.upper()).get()
        return doc.to_dict() if doc.exists else None