export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          position_department: string | null
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          position_department?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          position_department?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_tenant_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "client_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          client_code: string | null
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          legal_name: string | null
          status: Database["public"]["Enums"]["record_status"]
          tax_identifier: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_code?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          legal_name?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tax_identifier?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_code?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          legal_name?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tax_identifier?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_parent_id_tenant_id_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_locations: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_entities: {
        Row: {
          created_at: string
          display_name: string
          id: string
          legal_name: string | null
          status: Database["public"]["Enums"]["legal_entity_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          legal_name?: string | null
          status?: Database["public"]["Enums"]["legal_entity_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          legal_name?: string | null
          status?: Database["public"]["Enums"]["legal_entity_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_entities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_data_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_data_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          created_at: string
          membership_id: string
          role: Database["public"]["Enums"]["tenant_role"]
        }
        Insert: {
          created_at?: string
          membership_id: string
          role: Database["public"]["Enums"]["tenant_role"]
        }
        Update: {
          created_at?: string
          membership_id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          display_name: string
          id: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          display_name: string
          email: string | null
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
          vendor_code: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          email?: string | null
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
          vendor_code?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
          vendor_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vessel_project_lifecycle_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          from_status:
            | Database["public"]["Enums"]["vessel_project_lifecycle_status"]
            | null
          id: string
          project_id: string
          reason: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["vessel_project_lifecycle_status"]
            | null
          id?: string
          project_id: string
          reason?: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["vessel_project_lifecycle_status"]
            | null
          id?: string
          project_id?: string
          reason?: string | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
        }
        Relationships: [
          {
            foreignKeyName: "vessel_project_lifecycle_events_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "vessel_project_lifecycle_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vessel_projects: {
        Row: {
          client_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          facility_location_id: string
          id: string
          lifecycle_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          project_code: string | null
          ready_to_close_at: string | null
          service_type_id: string
          start_date: string
          tenant_id: string
          updated_at: string
          vessel_id: string
        }
        Insert: {
          client_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          facility_location_id: string
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          project_code?: string | null
          ready_to_close_at?: string | null
          service_type_id: string
          start_date: string
          tenant_id: string
          updated_at?: string
          vessel_id: string
        }
        Update: {
          client_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          facility_location_id?: string
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          project_code?: string | null
          ready_to_close_at?: string | null
          service_type_id?: string
          start_date?: string
          tenant_id?: string
          updated_at?: string
          vessel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vessel_projects_client_id_tenant_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "vessel_projects_facility_location_id_tenant_id_fkey"
            columns: ["facility_location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "facility_locations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "vessel_projects_service_type_id_tenant_id_fkey"
            columns: ["service_type_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "vessel_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vessel_projects_vessel_id_tenant_id_fkey"
            columns: ["vessel_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      vessels: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          registration_number: string | null
          status: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at: string
          vessel_code: string | null
          vessel_name: string
          vessel_type: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          registration_number?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id: string
          updated_at?: string
          vessel_code?: string | null
          vessel_name: string
          vessel_type?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          registration_number?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tenant_id?: string
          updated_at?: string
          vessel_code?: string | null
          vessel_name?: string
          vessel_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vessels_client_id_tenant_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "vessels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      log_master_data_audit_event: {
        Args: {
          p_action: string
          p_after_data: Json
          p_before_data: Json
          p_entity_id: string
          p_entity_type: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      transition_vessel_project_lifecycle: {
        Args: {
          p_project_id: string
          p_reason?: string
          p_to_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
        }
        Returns: {
          client_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          facility_location_id: string
          id: string
          lifecycle_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          project_code: string | null
          ready_to_close_at: string | null
          service_type_id: string
          start_date: string
          tenant_id: string
          updated_at: string
          vessel_id: string
        }
        SetofOptions: {
          from: "*"
          to: "vessel_projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      legal_entity_status: "active" | "inactive"
      membership_status: "invited" | "active" | "suspended"
      record_status: "active" | "inactive"
      tenant_role: "owner" | "admin" | "reviewer" | "viewer"
      tenant_status: "active" | "suspended"
      vessel_project_lifecycle_status: "active" | "ready_to_close" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      legal_entity_status: ["active", "inactive"],
      membership_status: ["invited", "active", "suspended"],
      record_status: ["active", "inactive"],
      tenant_role: ["owner", "admin", "reviewer", "viewer"],
      tenant_status: ["active", "suspended"],
      vessel_project_lifecycle_status: ["active", "ready_to_close", "closed"],
    },
  },
} as const

