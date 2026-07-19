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
      cash_pool_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          entry_kind: Database["public"]["Enums"]["cash_pool_entry_kind"]
          entry_type: Database["public"]["Enums"]["cash_pool_entry_type"]
          id: string
          pool_id: string
          reverses_entry_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_kind?: Database["public"]["Enums"]["cash_pool_entry_kind"]
          entry_type: Database["public"]["Enums"]["cash_pool_entry_type"]
          id?: string
          pool_id: string
          reverses_entry_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_kind?: Database["public"]["Enums"]["cash_pool_entry_kind"]
          entry_type?: Database["public"]["Enums"]["cash_pool_entry_type"]
          id?: string
          pool_id?: string
          reverses_entry_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_pool_entries_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_daily_summary"
            referencedColumns: ["pool_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_pool_entries_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_pool_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_pool_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_pools: {
        Row: {
          business_date: string
          created_at: string
          created_by: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          business_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          business_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_pools_tenant_id_fkey"
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
      expense_submission_revisions: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          pool_id: string
          project_id: string
          reference_number: string | null
          revision_number: number
          submission_id: string
          tenant_id: string
          vendor_id: string | null
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          pool_id: string
          project_id: string
          reference_number?: string | null
          revision_number: number
          submission_id: string
          tenant_id: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          pool_id?: string
          project_id?: string
          reference_number?: string | null
          revision_number?: number
          submission_id?: string
          tenant_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_submission_revisions_category_id_tenant_id_fkey"
            columns: ["category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_daily_summary"
            referencedColumns: ["pool_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_submission_id_tenant_id_fkey"
            columns: ["submission_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["submission_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_submission_id_tenant_id_fkey"
            columns: ["submission_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submissions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submission_revisions_vendor_id_tenant_id_fkey"
            columns: ["vendor_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      expense_submission_status_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          from_status:
            | Database["public"]["Enums"]["expense_submission_status"]
            | null
          id: string
          reason: string | null
          revision_id: string | null
          submission_id: string
          tenant_id: string
          to_status: Database["public"]["Enums"]["expense_submission_status"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["expense_submission_status"]
            | null
          id?: string
          reason?: string | null
          revision_id?: string | null
          submission_id: string
          tenant_id: string
          to_status: Database["public"]["Enums"]["expense_submission_status"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["expense_submission_status"]
            | null
          id?: string
          reason?: string | null
          revision_id?: string | null
          submission_id?: string
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["expense_submission_status"]
        }
        Relationships: [
          {
            foreignKeyName: "expense_submission_status_events_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "expense_submission_status_events_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submission_status_events_submission_id_tenant_id_fkey"
            columns: ["submission_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["submission_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_status_events_submission_id_tenant_id_fkey"
            columns: ["submission_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submissions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_submission_status_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_submissions: {
        Row: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          ledger_entry_id: string | null
          needs_correction_revision_id: string | null
          status: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          needs_correction_revision_id?: string | null
          status?: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          ledger_entry_id?: string | null
          needs_correction_revision_id?: string | null
          status?: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_submissions_current_revision_id_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "expense_submissions_current_revision_id_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_needs_correction_revision_id_fkey"
            columns: ["needs_correction_revision_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["revision_id"]
          },
          {
            foreignKeyName: "expense_submissions_needs_correction_revision_id_fkey"
            columns: ["needs_correction_revision_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_tenant_id_fkey"
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
      project_cost_ledger_entries: {
        Row: {
          actor_user_id: string | null
          amount: number
          category_id: string
          created_at: string
          description: string
          entry_kind: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          id: string
          pool_id: string
          project_id: string
          reference_number: string | null
          reverses_entry_id: string | null
          tenant_id: string
          vendor_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          amount: number
          category_id: string
          created_at?: string
          description: string
          entry_kind?: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          id?: string
          pool_id: string
          project_id: string
          reference_number?: string | null
          reverses_entry_id?: string | null
          tenant_id: string
          vendor_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          amount?: number
          category_id?: string
          created_at?: string
          description?: string
          entry_kind?: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          id?: string
          pool_id?: string
          project_id?: string
          reference_number?: string | null
          reverses_entry_id?: string | null
          tenant_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_ledger_entries_category_id_tenant_id_fkey"
            columns: ["category_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_daily_summary"
            referencedColumns: ["pool_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_vendor_id_tenant_id_fkey"
            columns: ["vendor_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
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
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
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
      cash_pool_daily_summary: {
        Row: {
          business_date: string | null
          cash_top_up: number | null
          closing_cash: number | null
          created_at: string | null
          opening_cash: number | null
          other_cash_in: number | null
          pool_id: string | null
          tenant_id: string | null
          total_cash_out: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_pools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_submission_current: {
        Row: {
          amount: number | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          description: string | null
          ledger_entry_id: string | null
          pool_id: string | null
          project_id: string | null
          reference_number: string | null
          revision_created_at: string | null
          revision_created_by: string | null
          revision_id: string | null
          revision_number: number | null
          status:
            | Database["public"]["Enums"]["expense_submission_status"]
            | null
          submission_id: string | null
          tenant_id: string | null
          updated_at: string | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vessel_project_cost_summary: {
        Row: {
          project_id: string | null
          tenant_id: string | null
          total_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vessel_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_expense_submission: {
        Args: { p_submission_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          ledger_entry_id: string | null
          needs_correction_revision_id: string | null
          status: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expense_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_expense_draft: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_pool_id: string
          p_project_id: string
          p_reference_number?: string
          p_tenant_id: string
          p_vendor_id?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          ledger_entry_id: string | null
          needs_correction_revision_id: string | null
          status: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expense_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_daily_cash_pool: {
        Args: { p_business_date: string; p_tenant_id: string }
        Returns: {
          business_date: string
          created_at: string
          created_by: string | null
          id: string
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_pools"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      record_cash_pool_entry: {
        Args: {
          p_amount: number
          p_description?: string
          p_entry_type: Database["public"]["Enums"]["cash_pool_entry_type"]
          p_pool_id: string
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          entry_kind: Database["public"]["Enums"]["cash_pool_entry_kind"]
          entry_type: Database["public"]["Enums"]["cash_pool_entry_type"]
          id: string
          pool_id: string
          reverses_entry_id: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_pool_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_project_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_pool_id: string
          p_project_id: string
          p_reference_number?: string
          p_vendor_id?: string
        }
        Returns: {
          actor_user_id: string | null
          amount: number
          category_id: string
          created_at: string
          description: string
          entry_kind: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          id: string
          pool_id: string
          project_id: string
          reference_number: string | null
          reverses_entry_id: string | null
          tenant_id: string
          vendor_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "project_cost_ledger_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_expense_submission: {
        Args: { p_reason: string; p_submission_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          ledger_entry_id: string | null
          needs_correction_revision_id: string | null
          status: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expense_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_expense_correction: {
        Args: { p_reason: string; p_submission_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          ledger_entry_id: string | null
          needs_correction_revision_id: string | null
          status: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expense_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_cash_pool_entry: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          entry_kind: Database["public"]["Enums"]["cash_pool_entry_kind"]
          entry_type: Database["public"]["Enums"]["cash_pool_entry_type"]
          id: string
          pool_id: string
          reverses_entry_id: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_pool_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_project_expense: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: {
          actor_user_id: string | null
          amount: number
          category_id: string
          created_at: string
          description: string
          entry_kind: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          id: string
          pool_id: string
          project_id: string
          reference_number: string | null
          reverses_entry_id: string | null
          tenant_id: string
          vendor_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "project_cost_ledger_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revise_expense_draft: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_pool_id: string
          p_project_id: string
          p_reference_number?: string
          p_submission_id: string
          p_vendor_id?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          ledger_entry_id: string | null
          needs_correction_revision_id: string | null
          status: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expense_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_expense: {
        Args: { p_submission_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          ledger_entry_id: string | null
          needs_correction_revision_id: string | null
          status: Database["public"]["Enums"]["expense_submission_status"]
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expense_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
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
      cash_pool_entry_kind: "entry" | "reversal"
      cash_pool_entry_type: "opening_cash" | "cash_top_up" | "other_cash_in"
      expense_submission_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "needs_correction"
      legal_entity_status: "active" | "inactive"
      membership_status: "invited" | "active" | "suspended"
      project_cost_ledger_entry_kind: "expense" | "reversal"
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
      cash_pool_entry_kind: ["entry", "reversal"],
      cash_pool_entry_type: ["opening_cash", "cash_top_up", "other_cash_in"],
      expense_submission_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "needs_correction",
      ],
      legal_entity_status: ["active", "inactive"],
      membership_status: ["invited", "active", "suspended"],
      project_cost_ledger_entry_kind: ["expense", "reversal"],
      record_status: ["active", "inactive"],
      tenant_role: ["owner", "admin", "reviewer", "viewer"],
      tenant_status: ["active", "suspended"],
      vessel_project_lifecycle_status: ["active", "ready_to_close", "closed"],
    },
  },
} as const

