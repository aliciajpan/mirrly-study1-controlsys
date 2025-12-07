"""
Gesture Mapping
Maps content types and section details to robot gestures
"""
from typing import Dict, Optional, Any


class GestureMapper:
    """Maps section properties to appropriate robot gestures."""

    # Default gesture map by content type
    DEFAULT_GESTURES = {
        "audio": "center_all",
        "video": "center_all",
        "image": "center_all",
        "image+audio": "center_all",
        "audio-select": "celebrate_arms_up",
    }

    @staticmethod
    def get_gesture(section: Dict[str, Any]) -> Optional[str]:
        """
        Determine the appropriate gesture for a section.
        
        Precedence:
        1. Explicit 'gesture' field in section (from playlist.json)
        2. Type-specific default from DEFAULT_GESTURES
        3. None if no mapping found
        
        Args:
            section: The section dict from playlist
            
        Returns:
            Gesture name or None
        """
        # Explicit gesture in playlist
        if "gesture" in section:
            return section["gesture"]

        # Type-based default
        section_type = section.get("type", "")
        return GestureMapper.DEFAULT_GESTURES.get(section_type)

    @staticmethod
    def get_metadata(section: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract metadata to send with the gesture.
        
        Args:
            section: The section dict from playlist
            
        Returns:
            Metadata dict
        """
        return {
            "section_id": section.get("id"),
            "section_type": section.get("type"),
            "section_title": section.get("title"),
        }
