export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  private: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_manage_session: {
        Args: { p_session_id: string; p_user_id?: string };
        Returns: boolean;
      };
      consume_rate_limit: {
        Args: {
          p_bucket: string;
          p_limit: number;
          p_rate_key: string;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      has_room_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["room_role"][];
          p_room_id: string;
          p_user_id?: string;
        };
        Returns: boolean;
      };
      is_room_member: {
        Args: { p_room_id: string; p_user_id?: string };
        Returns: boolean;
      };
      is_session_participant: {
        Args: { p_session_id: string; p_user_id?: string };
        Returns: boolean;
      };
      require_room_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["room_role"][];
          p_room_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          id: number;
          metadata: Json;
          room_id: string | null;
          session_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: number;
          metadata?: Json;
          room_id?: string | null;
          session_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: number;
          metadata?: Json;
          room_id?: string | null;
          session_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      media_participants: {
        Row: {
          created_at: string;
          id: string;
          joined_at: string | null;
          left_at: string | null;
          provider: string;
          provider_meeting_id: string | null;
          provider_participant_id: string | null;
          provider_preset_name: string | null;
          session_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          joined_at?: string | null;
          left_at?: string | null;
          provider?: string;
          provider_meeting_id?: string | null;
          provider_participant_id?: string | null;
          provider_preset_name?: string | null;
          session_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          joined_at?: string | null;
          left_at?: string | null;
          provider?: string;
          provider_meeting_id?: string | null;
          provider_participant_id?: string | null;
          provider_preset_name?: string | null;
          session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_participants_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          session_id: string;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          session_id: string;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          session_id?: string;
          target_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      private_notes: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          session_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          session_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "private_notes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          bucket: string;
          hit_count: number;
          rate_key: string;
          updated_at: string;
          window_started_at: string;
        };
        Insert: {
          bucket: string;
          hit_count?: number;
          rate_key: string;
          updated_at?: string;
          window_started_at: string;
        };
        Update: {
          bucket?: string;
          hit_count?: number;
          rate_key?: string;
          updated_at?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
      registrations: {
        Row: {
          created_at: string | null;
          email: string;
          id: string;
          name: string;
          question: string | null;
        };
        Insert: {
          created_at?: string | null;
          email: string;
          id?: string;
          name: string;
          question?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string;
          id?: string;
          name?: string;
          question?: string | null;
        };
        Relationships: [];
      };
      room_invites: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          max_uses: number | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["room_role"];
          room_id: string;
          token_hash: string;
          updated_at: string;
          uses_count: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["room_role"];
          room_id: string;
          token_hash: string;
          updated_at?: string;
          uses_count?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["room_role"];
          room_id?: string;
          token_hash?: string;
          updated_at?: string;
          uses_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "room_invites_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_members: {
        Row: {
          created_at: string;
          invited_by: string | null;
          joined_at: string;
          role: Database["public"]["Enums"]["room_role"];
          room_id: string;
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          invited_by?: string | null;
          joined_at?: string;
          role?: Database["public"]["Enums"]["room_role"];
          room_id: string;
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          invited_by?: string | null;
          joined_at?: string;
          role?: Database["public"]["Enums"]["room_role"];
          room_id?: string;
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      room_messages: {
        Row: { id: string; session_id: string; room_id: string; sender_id: string; recipient_id: string | null; message: string; message_type: string; created_at: string };
        Insert: { id?: string; session_id: string; room_id: string; sender_id: string; recipient_id?: string | null; message: string; message_type?: string; created_at?: string };
        Update: { id?: string; session_id?: string; room_id?: string; sender_id?: string; recipient_id?: string | null; message?: string; message_type?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "room_messages_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "room_messages_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["id"] },
        ];
      };
      rooms: {
        Row: {
          access_mode: string;
          capacity: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          room_type: string;
          slug: string;
          stage_capacity: number;
          status: Database["public"]["Enums"]["room_status"];
          updated_at: string;
        };
        Insert: {
          access_mode?: string;
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          room_type?: string;
          slug: string;
          stage_capacity?: number;
          status?: Database["public"]["Enums"]["room_status"];
          updated_at?: string;
        };
        Update: {
          access_mode?: string;
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          room_type?: string;
          slug?: string;
          stage_capacity?: number;
          status?: Database["public"]["Enums"]["room_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      session_notes: {
        Row: {
          body: string;
          created_at: string;
          points: Json;
          session_id: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body?: string;
          created_at?: string;
          points?: Json;
          session_id: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body?: string;
          created_at?: string;
          points?: Json;
          session_id?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_notes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      session_participants: {
        Row: {
          client_instance_id: string | null;
          created_at: string;
          current_role: Database["public"]["Enums"]["room_role"];
          display_name: string;
          id: string;
          joined_at: string;
          last_seen_at: string;
          left_at: string | null;
          presence_state: Json;
          role_snapshot: Database["public"]["Enums"]["room_role"];
          room_id: string;
          session_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          client_instance_id?: string | null;
          created_at?: string;
          current_role?: Database["public"]["Enums"]["room_role"];
          display_name: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          left_at?: string | null;
          presence_state?: Json;
          role_snapshot?: Database["public"]["Enums"]["room_role"];
          room_id: string;
          session_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          client_instance_id?: string | null;
          created_at?: string;
          current_role?: Database["public"]["Enums"]["room_role"];
          display_name?: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          left_at?: string | null;
          presence_state?: Json;
          role_snapshot?: Database["public"]["Enums"]["room_role"];
          room_id?: string;
          session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_participants_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_participants_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          agenda: string | null;
          created_at: string;
          created_by: string | null;
          ended_at: string | null;
          ends_at: string | null;
          id: string;
          media_created_at: string | null;
          media_provider: string;
          provider_meeting_id: string | null;
          room_id: string;
          scheduled_at: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["session_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          agenda?: string | null;
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          ends_at?: string | null;
          id?: string;
          media_created_at?: string | null;
          media_provider?: string;
          provider_meeting_id?: string | null;
          room_id: string;
          scheduled_at?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["session_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          agenda?: string | null;
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          ends_at?: string | null;
          id?: string;
          media_created_at?: string | null;
          media_provider?: string;
          provider_meeting_id?: string | null;
          room_id?: string;
          scheduled_at?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["session_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      stage_requests: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          requested_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
          session_id: string;
          status: Database["public"]["Enums"]["stage_request_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          session_id: string;
          status?: Database["public"]["Enums"]["stage_request_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          session_id?: string;
          status?: Database["public"]["Enums"]["stage_request_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stage_requests_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_rate_limit_server: {
        Args: {
          p_bucket: string;
          p_limit: number;
          p_rate_key: string;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      create_room_invite: {
        Args: {
          p_expires_at?: string;
          p_max_uses?: number;
          p_role?: Database["public"]["Enums"]["room_role"];
          p_room_id: string;
        };
        Returns: {
          expires_at: string;
          invite_id: string;
          invite_token: string;
          max_uses: number;
          role: Database["public"]["Enums"]["room_role"];
        }[];
      };
      create_session: {
        Args: {
          p_agenda?: string;
          p_room_id: string;
          p_scheduled_at?: string;
          p_title: string;
        };
        Returns: string;
      };
      end_session: { Args: { p_session_id: string }; Returns: undefined };
      get_active_session: {
        Args: { p_room_id: string };
        Returns: {
          agenda: string;
          ended_at: string;
          id: string;
          scheduled_at: string;
          started_at: string;
          status: Database["public"]["Enums"]["session_status"];
          title: string;
        }[];
      };
      get_room_by_slug: {
        Args: { p_slug: string };
        Returns: {
          access_mode: string;
          capacity: number;
          description: string;
          id: string;
          my_role: Database["public"]["Enums"]["room_role"];
          name: string;
          room_type: string;
          slug: string;
          stage_capacity: number;
          status: Database["public"]["Enums"]["room_status"];
        }[];
      };
      join_live_session: {
        Args: { p_client_instance_id?: string; p_session_id: string };
        Returns: {
          display_name: string;
          participant_id: string;
          role: Database["public"]["Enums"]["room_role"];
          room_id: string;
        }[];
      };
      join_room_with_invite: {
        Args: {
          p_display_name: string;
          p_invite_token: string;
          p_room_slug: string;
        };
        Returns: {
          role: Database["public"]["Enums"]["room_role"];
          room_id: string;
        }[];
      };
      leave_live_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      redeem_room_invite_server: {
        Args: {
          p_display_name: string;
          p_invite_token: string;
          p_room_slug: string;
          p_user_id: string;
        };
        Returns: {
          role: Database["public"]["Enums"]["room_role"];
          room_id: string;
        }[];
      };
      resolve_stage_request: {
        Args: { p_approve: boolean; p_request_id: string };
        Returns: undefined;
      };
      revoke_room_invite: { Args: { p_invite_id: string }; Returns: undefined };
      set_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["room_role"];
          p_room_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      start_session: { Args: { p_session_id: string }; Returns: undefined };
      update_session_notes: {
        Args: {
          p_body: string;
          p_points: Json;
          p_session_id: string;
          p_title: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      membership_status: "active" | "blocked" | "revoked";
      room_role: "host" | "moderator" | "speaker" | "audience";
      room_status: "active" | "archived";
      session_status: "scheduled" | "live" | "ended" | "cancelled";
      stage_request_status:
        | "pending"
        | "approved"
        | "declined"
        | "cancelled"
        | "completed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  private: {
    Enums: {},
  },
  public: {
    Enums: {
      membership_status: ["active", "blocked", "revoked"],
      room_role: ["host", "moderator", "speaker", "audience"],
      room_status: ["active", "archived"],
      session_status: ["scheduled", "live", "ended", "cancelled"],
      stage_request_status: [
        "pending",
        "approved",
        "declined",
        "cancelled",
        "completed",
      ],
    },
  },
} as const;
