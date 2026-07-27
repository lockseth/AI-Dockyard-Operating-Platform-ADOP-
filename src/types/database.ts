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
      cash_import_batches: {
        Row: {
          business_date: string
          calculated_closing_balance: number
          canonical_cash_top_up_total: number | null
          canonical_closing_cash: number | null
          canonical_opening_cash: number | null
          canonical_project_expense_total: number | null
          canonical_project_refund_total: number | null
          canonical_shared_overhead_total: number | null
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          error_count: number
          id: string
          opening_balance: number
          rollback_reason: string | null
          rollback_reversal_count: number | null
          rollback_reversed_cash_effect: number | null
          rollback_reversed_project_cost: number | null
          rollback_reversed_refund_effect: number | null
          rollback_reversed_shared_overhead: number | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          source_filename: string
          source_sha256: string
          source_sheet_name: string
          status: Database["public"]["Enums"]["cash_import_batch_status"]
          tenant_id: string
          total_credit: number
          total_debit: number
          transaction_count: number
          updated_at: string
          warning_count: number
          workbook_closing_balance: number | null
        }
        Insert: {
          business_date: string
          calculated_closing_balance?: number
          canonical_cash_top_up_total?: number | null
          canonical_closing_cash?: number | null
          canonical_opening_cash?: number | null
          canonical_project_expense_total?: number | null
          canonical_project_refund_total?: number | null
          canonical_shared_overhead_total?: number | null
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          id?: string
          opening_balance: number
          rollback_reason?: string | null
          rollback_reversal_count?: number | null
          rollback_reversed_cash_effect?: number | null
          rollback_reversed_project_cost?: number | null
          rollback_reversed_refund_effect?: number | null
          rollback_reversed_shared_overhead?: number | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          source_filename: string
          source_sha256: string
          source_sheet_name: string
          status?: Database["public"]["Enums"]["cash_import_batch_status"]
          tenant_id: string
          total_credit?: number
          total_debit?: number
          transaction_count?: number
          updated_at?: string
          warning_count?: number
          workbook_closing_balance?: number | null
        }
        Update: {
          business_date?: string
          calculated_closing_balance?: number
          canonical_cash_top_up_total?: number | null
          canonical_closing_cash?: number | null
          canonical_opening_cash?: number | null
          canonical_project_expense_total?: number | null
          canonical_project_refund_total?: number | null
          canonical_shared_overhead_total?: number | null
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          id?: string
          opening_balance?: number
          rollback_reason?: string | null
          rollback_reversal_count?: number | null
          rollback_reversed_cash_effect?: number | null
          rollback_reversed_project_cost?: number | null
          rollback_reversed_refund_effect?: number | null
          rollback_reversed_shared_overhead?: number | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          source_filename?: string
          source_sha256?: string
          source_sheet_name?: string
          status?: Database["public"]["Enums"]["cash_import_batch_status"]
          tenant_id?: string
          total_credit?: number
          total_debit?: number
          transaction_count?: number
          updated_at?: string
          warning_count?: number
          workbook_closing_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_import_events: {
        Row: {
          actor_user_id: string | null
          batch_id: string
          created_at: string
          event_payload: Json
          event_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          batch_id: string
          created_at?: string
          event_payload?: Json
          event_type: string
          id?: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          batch_id?: string
          created_at?: string
          event_payload?: Json
          event_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_import_events_batch_id_tenant_id_fkey"
            columns: ["batch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_batches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_import_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_import_rows: {
        Row: {
          batch_id: string
          calculated_balance: number | null
          created_at: string
          credit: number | null
          debit: number | null
          description: string | null
          disposition:
            | Database["public"]["Enums"]["cash_import_row_disposition"]
            | null
          disposition_reason: string | null
          duplicate_group_key: string | null
          id: string
          mapped_vessel_project_id: string | null
          mapping_kind:
            | Database["public"]["Enums"]["cash_import_mapping_kind"]
            | null
          provisional_classification: Database["public"]["Enums"]["cash_import_provisional_classification"]
          source_fingerprint: string
          source_row_number: number
          status: Database["public"]["Enums"]["cash_import_row_status"]
          tenant_id: string
          updated_at: string
          validation_issues: Json
          vessel_label: string | null
          workbook_balance: number | null
        }
        Insert: {
          batch_id: string
          calculated_balance?: number | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          description?: string | null
          disposition?:
            | Database["public"]["Enums"]["cash_import_row_disposition"]
            | null
          disposition_reason?: string | null
          duplicate_group_key?: string | null
          id?: string
          mapped_vessel_project_id?: string | null
          mapping_kind?:
            | Database["public"]["Enums"]["cash_import_mapping_kind"]
            | null
          provisional_classification: Database["public"]["Enums"]["cash_import_provisional_classification"]
          source_fingerprint: string
          source_row_number: number
          status: Database["public"]["Enums"]["cash_import_row_status"]
          tenant_id: string
          updated_at?: string
          validation_issues?: Json
          vessel_label?: string | null
          workbook_balance?: number | null
        }
        Update: {
          batch_id?: string
          calculated_balance?: number | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          description?: string | null
          disposition?:
            | Database["public"]["Enums"]["cash_import_row_disposition"]
            | null
          disposition_reason?: string | null
          duplicate_group_key?: string | null
          id?: string
          mapped_vessel_project_id?: string | null
          mapping_kind?:
            | Database["public"]["Enums"]["cash_import_mapping_kind"]
            | null
          provisional_classification?: Database["public"]["Enums"]["cash_import_provisional_classification"]
          source_fingerprint?: string
          source_row_number?: number
          status?: Database["public"]["Enums"]["cash_import_row_status"]
          tenant_id?: string
          updated_at?: string
          validation_issues?: Json
          vessel_label?: string | null
          workbook_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_import_rows_batch_id_tenant_id_fkey"
            columns: ["batch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_batches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_import_rows_mapped_vessel_project_id_tenant_id_fkey"
            columns: ["mapped_vessel_project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_import_rows_mapped_vessel_project_id_tenant_id_fkey"
            columns: ["mapped_vessel_project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_import_rows_mapped_vessel_project_id_tenant_id_fkey"
            columns: ["mapped_vessel_project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_import_rows_tenant_id_fkey"
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
          import_batch_id: string | null
          import_row_id: string | null
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
          import_batch_id?: string | null
          import_row_id?: string | null
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
          import_batch_id?: string | null
          import_row_id?: string | null
          pool_id?: string
          reverses_entry_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_pool_entries_import_batch_id_fkey"
            columns: ["import_batch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_batches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_pool_entries_import_row_id_fkey"
            columns: ["import_row_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_rows"
            referencedColumns: ["id", "tenant_id"]
          },
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
      cash_pool_reopen_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          pool_id: string
          previous_reconciliation_id: string
          reason: string
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          pool_id: string
          previous_reconciliation_id: string
          reason: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          pool_id?: string
          previous_reconciliation_id?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_pool_reopen_events_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_daily_summary"
            referencedColumns: ["pool_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_pool_reopen_events_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_pool_reopen_events_previous_reconciliation_id_tenant__fkey"
            columns: ["previous_reconciliation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_reconciliation_current"
            referencedColumns: ["reconciliation_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_pool_reopen_events_previous_reconciliation_id_tenant__fkey"
            columns: ["previous_reconciliation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_pool_reopen_events_tenant_id_fkey"
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
          daily_close_status: Database["public"]["Enums"]["cash_pool_daily_close_status"]
          financial_version: number
          id: string
          opening_cash_posted: boolean
          tenant_id: string
        }
        Insert: {
          business_date: string
          created_at?: string
          created_by?: string | null
          daily_close_status?: Database["public"]["Enums"]["cash_pool_daily_close_status"]
          financial_version?: number
          id?: string
          opening_cash_posted?: boolean
          tenant_id: string
        }
        Update: {
          business_date?: string
          created_at?: string
          created_by?: string | null
          daily_close_status?: Database["public"]["Enums"]["cash_pool_daily_close_status"]
          financial_version?: number
          id?: string
          opening_cash_posted?: boolean
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
      cash_reconciliation_revisions: {
        Row: {
          actual_counted_cash: number
          created_at: string
          created_by: string | null
          explanation: string | null
          id: string
          reconciliation_id: string
          revision_number: number
          tenant_id: string
        }
        Insert: {
          actual_counted_cash: number
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          reconciliation_id: string
          revision_number: number
          tenant_id: string
        }
        Update: {
          actual_counted_cash?: number
          created_at?: string
          created_by?: string | null
          explanation?: string | null
          id?: string
          reconciliation_id?: string
          revision_number?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliation_revisions_reconciliation_id_tenant_id_fkey"
            columns: ["reconciliation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_reconciliation_current"
            referencedColumns: ["reconciliation_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliation_revisions_reconciliation_id_tenant_id_fkey"
            columns: ["reconciliation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliation_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliation_status_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          from_status:
            | Database["public"]["Enums"]["cash_reconciliation_status"]
            | null
          id: string
          reason: string | null
          reconciliation_id: string
          revision_id: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["cash_reconciliation_status"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["cash_reconciliation_status"]
            | null
          id?: string
          reason?: string | null
          reconciliation_id: string
          revision_id?: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["cash_reconciliation_status"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["cash_reconciliation_status"]
            | null
          id?: string
          reason?: string | null
          reconciliation_id?: string
          revision_id?: string | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["cash_reconciliation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliation_status_eve_reconciliation_id_tenant_id_fkey"
            columns: ["reconciliation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_reconciliation_current"
            referencedColumns: ["reconciliation_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliation_status_eve_reconciliation_id_tenant_id_fkey"
            columns: ["reconciliation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliation_status_events_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliation_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliation_status_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliations: {
        Row: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          needs_correction_revision_id: string | null
          pool_id: string
          status: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          needs_correction_revision_id?: string | null
          pool_id: string
          status?: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_cash_top_up?: number | null
          submitted_expected_closing_cash?: number | null
          submitted_financial_version?: number | null
          submitted_opening_cash?: number | null
          submitted_other_cash_in?: number | null
          submitted_total_cash_out?: number | null
          submitted_variance?: number | null
          superseded_at?: string | null
          superseded_by_reopen_event_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_revision_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          needs_correction_revision_id?: string | null
          pool_id?: string
          status?: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_cash_top_up?: number | null
          submitted_expected_closing_cash?: number | null
          submitted_financial_version?: number | null
          submitted_opening_cash?: number | null
          submitted_other_cash_in?: number | null
          submitted_total_cash_out?: number | null
          submitted_variance?: number | null
          superseded_at?: string | null
          superseded_by_reopen_event_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliations_current_revision_id_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliation_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_needs_correction_revision_id_fkey"
            columns: ["needs_correction_revision_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliation_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_daily_summary"
            referencedColumns: ["pool_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_superseded_by_reopen_event_id_fkey"
            columns: ["superseded_by_reopen_event_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_reopen_events"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_tenant_id_fkey"
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
          receives_collection_reminder: boolean
          receives_invoice_email: boolean
          receives_invoice_whatsapp: boolean
          role: Database["public"]["Enums"]["client_contact_role"] | null
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
          receives_collection_reminder?: boolean
          receives_invoice_email?: boolean
          receives_invoice_whatsapp?: boolean
          role?: Database["public"]["Enums"]["client_contact_role"] | null
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
          receives_collection_reminder?: boolean
          receives_invoice_email?: boolean
          receives_invoice_whatsapp?: boolean
          role?: Database["public"]["Enums"]["client_contact_role"] | null
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
          default_payment_term_days: number | null
          display_name: string
          id: string
          invoice_delivery_preference:
            | Database["public"]["Enums"]["invoice_delivery_channel"]
            | null
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
          default_payment_term_days?: number | null
          display_name: string
          id?: string
          invoice_delivery_preference?:
            | Database["public"]["Enums"]["invoice_delivery_channel"]
            | null
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
          default_payment_term_days?: number | null
          display_name?: string
          id?: string
          invoice_delivery_preference?:
            | Database["public"]["Enums"]["invoice_delivery_channel"]
            | null
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
      expense_duplicate_candidate_resolution_events: {
        Row: {
          actor_user_id: string | null
          candidate_id: string
          created_at: string
          from_status:
            | Database["public"]["Enums"]["expense_duplicate_candidate_status"]
            | null
          id: string
          reason: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
        }
        Insert: {
          actor_user_id?: string | null
          candidate_id: string
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["expense_duplicate_candidate_status"]
            | null
          id?: string
          reason?: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
        }
        Update: {
          actor_user_id?: string | null
          candidate_id?: string
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["expense_duplicate_candidate_status"]
            | null
          id?: string
          reason?: string | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
        }
        Relationships: [
          {
            foreignKeyName: "expense_duplicate_candidate_resolut_candidate_id_tenant_id_fkey"
            columns: ["candidate_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_duplicate_candidate_current"
            referencedColumns: ["candidate_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidate_resolut_candidate_id_tenant_id_fkey"
            columns: ["candidate_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_duplicate_candidates"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidate_resolution_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_duplicate_candidates: {
        Row: {
          detected_at: string
          id: string
          match_evidence: Json
          reason_code: Database["public"]["Enums"]["expense_duplicate_reason_code"]
          resolved_at: string | null
          resolved_by: string | null
          resolved_reason: string | null
          revision_id_1: string
          revision_id_2: string
          status: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
          submission_id_1: string
          submission_id_2: string
          tenant_id: string
        }
        Insert: {
          detected_at?: string
          id?: string
          match_evidence: Json
          reason_code: Database["public"]["Enums"]["expense_duplicate_reason_code"]
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_reason?: string | null
          revision_id_1: string
          revision_id_2: string
          status?: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
          submission_id_1: string
          submission_id_2: string
          tenant_id: string
        }
        Update: {
          detected_at?: string
          id?: string
          match_evidence?: Json
          reason_code?: Database["public"]["Enums"]["expense_duplicate_reason_code"]
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_reason?: string | null
          revision_id_1?: string
          revision_id_2?: string
          status?: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
          submission_id_1?: string
          submission_id_2?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_duplicate_candidates_revision_id_1_tenant_id_fkey"
            columns: ["revision_id_1", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_revisions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_revision_id_2_tenant_id_fkey"
            columns: ["revision_id_2", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_revisions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_1_tenant_id_fkey"
            columns: ["submission_id_1", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["submission_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_1_tenant_id_fkey"
            columns: ["submission_id_1", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submissions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_2_tenant_id_fkey"
            columns: ["submission_id_2", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["submission_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_2_tenant_id_fkey"
            columns: ["submission_id_2", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submissions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_tenant_id_fkey"
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
          entry_scope: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id: string | null
          id: string
          pool_id: string
          project_id: string | null
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
          entry_scope?: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id?: string | null
          id?: string
          pool_id: string
          project_id?: string | null
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
          entry_scope?: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id?: string | null
          id?: string
          pool_id?: string
          project_id?: string | null
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
            foreignKeyName: "expense_submission_revisions_facility_location_id_tenant_i_fkey"
            columns: ["facility_location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "facility_locations"
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
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
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
            referencedRelation: "invoice_eligible_transactions"
            referencedColumns: ["transaction_entry_id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "project_refund_ledger_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocation_status"
            referencedColumns: ["overhead_entry_id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_ledger_current"
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
      invoice_delivery_events: {
        Row: {
          acknowledgment_note: string | null
          channel: Database["public"]["Enums"]["invoice_delivery_event_channel"]
          created_at: string
          event_seq: number
          event_type: Database["public"]["Enums"]["invoice_delivery_event_type"]
          failure_reason: string | null
          id: string
          invoice_id: string
          provider_reference: string | null
          recipient_snapshot: string
          recorded_by: string | null
          tenant_id: string
        }
        Insert: {
          acknowledgment_note?: string | null
          channel: Database["public"]["Enums"]["invoice_delivery_event_channel"]
          created_at?: string
          event_seq?: number
          event_type: Database["public"]["Enums"]["invoice_delivery_event_type"]
          failure_reason?: string | null
          id?: string
          invoice_id: string
          provider_reference?: string | null
          recipient_snapshot: string
          recorded_by?: string | null
          tenant_id: string
        }
        Update: {
          acknowledgment_note?: string | null
          channel?: Database["public"]["Enums"]["invoice_delivery_event_channel"]
          created_at?: string
          event_seq?: number
          event_type?: Database["public"]["Enums"]["invoice_delivery_event_type"]
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          provider_reference?: string | null
          recipient_snapshot?: string
          recorded_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_delivery_events_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_delivery_events_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["successor_invoice_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_delivery_events_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_delivery_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_evidence: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_evidence_kind"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          invoice_id: string
          kind?: Database["public"]["Enums"]["invoice_evidence_kind"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          invoice_id?: string
          kind?: Database["public"]["Enums"]["invoice_evidence_kind"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_evidence_current_version_id_fkey"
            columns: ["current_version_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_evidence_versions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_evidence_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_evidence_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["successor_invoice_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_evidence_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_evidence_versions: {
        Row: {
          evidence_id: string
          id: string
          mime_type: string
          rejected_reason: string | null
          sha256: string
          size_bytes: number
          status: Database["public"]["Enums"]["invoice_evidence_version_status"]
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        Insert: {
          evidence_id: string
          id?: string
          mime_type: string
          rejected_reason?: string | null
          sha256: string
          size_bytes: number
          status?: Database["public"]["Enums"]["invoice_evidence_version_status"]
          storage_path: string
          tenant_id: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number: number
        }
        Update: {
          evidence_id?: string
          id?: string
          mime_type?: string
          rejected_reason?: string | null
          sha256?: string
          size_bytes?: number
          status?: Database["public"]["Enums"]["invoice_evidence_version_status"]
          storage_path?: string
          tenant_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_evidence_versions_evidence_id_tenant_id_fkey"
            columns: ["evidence_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_evidence"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_evidence_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_transaction_lines: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          project_id: string
          tenant_id: string
          transaction_category: string | null
          transaction_date: string | null
          transaction_entry_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          project_id: string
          tenant_id: string
          transaction_category?: string | null
          transaction_date?: string | null
          transaction_entry_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          project_id?: string
          tenant_id?: string
          transaction_category?: string | null
          transaction_date?: string | null
          transaction_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_transaction_lines_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["successor_invoice_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_eligible_transactions"
            referencedColumns: ["transaction_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_refund_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocation_status"
            referencedColumns: ["overhead_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          issued_at?: string | null
          issued_by?: string | null
          legacy_coverage_status?:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id?: string | null
          origin?: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at?: string
          void_at?: string | null
          void_by?: string | null
          void_reason?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          issued_at?: string | null
          issued_by?: string | null
          legacy_coverage_status?:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id?: string | null
          origin?: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tenant_id?: string
          updated_at?: string
          void_at?: string | null
          void_by?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_legal_entity_id_fkey"
            columns: ["legal_entity_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_predecessor_invoice_id_tenant_id_fkey"
            columns: ["predecessor_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_predecessor_invoice_id_tenant_id_fkey"
            columns: ["predecessor_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["successor_invoice_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_predecessor_invoice_id_tenant_id_fkey"
            columns: ["predecessor_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
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
          logo_path: string | null
          status: Database["public"]["Enums"]["legal_entity_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          status?: Database["public"]["Enums"]["legal_entity_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          legal_name?: string | null
          logo_path?: string | null
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
      notification_events: {
        Row: {
          attempt_count: number
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          payload: Json
          provider_message_id: string | null
          sent_at: string | null
          source_event_id: string
          status: Database["public"]["Enums"]["notification_status"]
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          payload?: Json
          provider_message_id?: string | null
          sent_at?: string | null
          source_event_id: string
          status?: Database["public"]["Enums"]["notification_status"]
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          payload?: Json
          provider_message_id?: string | null
          sent_at?: string | null
          source_event_id?: string
          status?: Database["public"]["Enums"]["notification_status"]
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_cost_ledger_entries: {
        Row: {
          actor_user_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          description: string
          entry_kind: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          entry_scope: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id: string | null
          id: string
          import_batch_id: string | null
          import_row_id: string | null
          pool_id: string
          project_id: string | null
          reference_number: string | null
          reverses_entry_id: string | null
          tenant_id: string
          vendor_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          description: string
          entry_kind?: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          entry_scope?: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_row_id?: string | null
          pool_id: string
          project_id?: string | null
          reference_number?: string | null
          reverses_entry_id?: string | null
          tenant_id: string
          vendor_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string
          entry_kind?: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          entry_scope?: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_row_id?: string | null
          pool_id?: string
          project_id?: string | null
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
            foreignKeyName: "project_cost_ledger_entries_facility_location_id_tenant_id_fkey"
            columns: ["facility_location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "facility_locations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_import_batch_id_fkey"
            columns: ["import_batch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_batches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_import_row_id_fkey"
            columns: ["import_row_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_rows"
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
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
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
            referencedRelation: "invoice_eligible_transactions"
            referencedColumns: ["transaction_entry_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "project_refund_ledger_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocation_status"
            referencedColumns: ["overhead_entry_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_ledger_current"
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
      shared_overhead_allocations: {
        Row: {
          actor_user_id: string | null
          allocation_kind: Database["public"]["Enums"]["shared_overhead_allocation_kind"]
          amount: number
          created_at: string
          id: string
          note: string | null
          overhead_entry_id: string
          project_id: string
          reverses_allocation_id: string | null
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          allocation_kind?: Database["public"]["Enums"]["shared_overhead_allocation_kind"]
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          overhead_entry_id: string
          project_id: string
          reverses_allocation_id?: string | null
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          allocation_kind?: Database["public"]["Enums"]["shared_overhead_allocation_kind"]
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          overhead_entry_id?: string
          project_id?: string
          reverses_allocation_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_eligible_transactions"
            referencedColumns: ["transaction_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_refund_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocation_status"
            referencedColumns: ["overhead_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_reverses_allocation_id_fkey"
            columns: ["reverses_allocation_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_reverses_allocation_id_fkey"
            columns: ["reverses_allocation_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocations_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          status: Database["public"]["Enums"]["tenant_invitation_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["tenant_invitation_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["tenant_invitation_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
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
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
          },
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
          facility_location_id: string | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          priority: Database["public"]["Enums"]["vessel_project_priority"]
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
          facility_location_id?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          priority?: Database["public"]["Enums"]["vessel_project_priority"]
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
          facility_location_id?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          priority?: Database["public"]["Enums"]["vessel_project_priority"]
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
          project_refund_in: number | null
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
      cash_pool_reconciliation_current: {
        Row: {
          actual_counted_cash: number | null
          business_date: string | null
          created_at: string | null
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          explanation: string | null
          is_stale: boolean | null
          pool_daily_close_status:
            | Database["public"]["Enums"]["cash_pool_daily_close_status"]
            | null
          pool_financial_version: number | null
          pool_id: string | null
          reconciliation_id: string | null
          revision_number: number | null
          status:
            | Database["public"]["Enums"]["cash_reconciliation_status"]
            | null
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliations_current_revision_id_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliation_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_daily_summary"
            referencedColumns: ["pool_id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_pool_id_tenant_id_fkey"
            columns: ["pool_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pools"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_superseded_by_reopen_event_id_fkey"
            columns: ["superseded_by_reopen_event_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_pool_reopen_events"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_duplicate_candidate_current: {
        Row: {
          amount_1: number | null
          amount_2: number | null
          candidate_id: string | null
          category_id_1: string | null
          category_id_2: string | null
          description_1: string | null
          description_2: string | null
          detected_at: string | null
          match_evidence: Json | null
          project_id_1: string | null
          project_id_2: string | null
          reason_code:
            | Database["public"]["Enums"]["expense_duplicate_reason_code"]
            | null
          reference_number_1: string | null
          reference_number_2: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_reason: string | null
          revision_number_1: number | null
          revision_number_2: number | null
          status:
            | Database["public"]["Enums"]["expense_duplicate_candidate_status"]
            | null
          submission_id_1: string | null
          submission_id_2: string | null
          submission_status_1:
            | Database["public"]["Enums"]["expense_submission_status"]
            | null
          submission_status_2:
            | Database["public"]["Enums"]["expense_submission_status"]
            | null
          tenant_id: string | null
          vendor_id_1: string | null
          vendor_id_2: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_1_tenant_id_fkey"
            columns: ["submission_id_1", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["submission_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_1_tenant_id_fkey"
            columns: ["submission_id_1", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submissions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_2_tenant_id_fkey"
            columns: ["submission_id_2", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submission_current"
            referencedColumns: ["submission_id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_submission_id_2_tenant_id_fkey"
            columns: ["submission_id_2", "tenant_id"]
            isOneToOne: false
            referencedRelation: "expense_submissions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "expense_duplicate_candidates_tenant_id_fkey"
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
          entry_scope:
            | Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
            | null
          facility_location_id: string | null
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
            referencedRelation: "invoice_eligible_transactions"
            referencedColumns: ["transaction_entry_id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "project_refund_ledger_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocation_status"
            referencedColumns: ["overhead_entry_id"]
          },
          {
            foreignKeyName: "expense_submissions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_ledger_current"
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
      invoice_billing_summary: {
        Row: {
          billing_completeness_status:
            | Database["public"]["Enums"]["invoice_billing_completeness_status"]
            | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          current_version_id: string | null
          current_version_number: number | null
          current_version_status:
            | Database["public"]["Enums"]["invoice_evidence_version_status"]
            | null
          due_date: string | null
          evidence_id: string | null
          id: string | null
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          is_final_document: boolean | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          line_count: number | null
          origin: Database["public"]["Enums"]["invoice_origin"] | null
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          successor_invoice_id: string | null
          tenant_id: string | null
          total_amount: number | null
          updated_at: string | null
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_legal_entity_id_fkey"
            columns: ["legal_entity_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_predecessor_invoice_id_tenant_id_fkey"
            columns: ["predecessor_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_predecessor_invoice_id_tenant_id_fkey"
            columns: ["predecessor_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["successor_invoice_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_predecessor_invoice_id_tenant_id_fkey"
            columns: ["predecessor_invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_eligible_transactions: {
        Row: {
          amount: number | null
          created_at: string | null
          description: string | null
          project_code: string | null
          project_id: string | null
          tenant_id: string | null
          transaction_entry_id: string | null
          vessel_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_ledger_entries_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
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
            foreignKeyName: "project_cost_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_refund_ledger_current: {
        Row: {
          actor_user_id: string | null
          amount: number | null
          business_date: string | null
          created_at: string | null
          description: string | null
          id: string | null
          import_batch_id: string | null
          import_row_id: string | null
          pool_id: string | null
          project_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_ledger_entries_import_batch_id_fkey"
            columns: ["import_batch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_batches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_import_row_id_fkey"
            columns: ["import_row_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_rows"
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
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
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
            foreignKeyName: "project_cost_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_overhead_allocation_status: {
        Row: {
          allocated_amount: number | null
          allocation_status: string | null
          business_date: string | null
          description: string | null
          facility_location_id: string | null
          overhead_amount: number | null
          overhead_entry_id: string | null
          pool_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_ledger_entries_facility_location_id_tenant_id_fkey"
            columns: ["facility_location_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "facility_locations"
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
            foreignKeyName: "project_cost_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_overhead_allocations_current: {
        Row: {
          actor_user_id: string | null
          amount: number | null
          created_at: string | null
          id: string | null
          note: string | null
          overhead_entry_id: string | null
          project_id: string | null
          tenant_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          amount?: number | null
          created_at?: string | null
          id?: string | null
          note?: string | null
          overhead_entry_id?: string | null
          project_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          amount?: number | null
          created_at?: string | null
          id?: string | null
          note?: string | null
          overhead_entry_id?: string | null
          project_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_eligible_transactions"
            referencedColumns: ["transaction_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_refund_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocation_status"
            referencedColumns: ["overhead_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_overhead_entry_id_tenant_id_fkey"
            columns: ["overhead_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "unbilled_vessel_projects"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_project_cost_summary"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_project_id_tenant_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vessel_projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shared_overhead_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_overhead_ledger_current: {
        Row: {
          actor_user_id: string | null
          amount: number | null
          business_date: string | null
          created_at: string | null
          description: string | null
          id: string | null
          import_batch_id: string | null
          import_row_id: string | null
          pool_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_ledger_entries_import_batch_id_fkey"
            columns: ["import_batch_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_batches"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_cost_ledger_entries_import_row_id_fkey"
            columns: ["import_row_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "cash_import_rows"
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
            foreignKeyName: "project_cost_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_invoice_bindings: {
        Row: {
          amount: number | null
          binding_id: string | null
          bound_at: string | null
          current_version_id: string | null
          current_version_status:
            | Database["public"]["Enums"]["invoice_evidence_version_status"]
            | null
          description: string | null
          invoice_id: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"] | null
          is_final_document: boolean | null
          predecessor_invoice_id: string | null
          tenant_id: string | null
          transaction_entry_id: string | null
          void_reason: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_transaction_lines_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_billing_summary"
            referencedColumns: ["successor_invoice_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_invoice_id_tenant_id_fkey"
            columns: ["invoice_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "invoice_eligible_transactions"
            referencedColumns: ["transaction_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_cost_ledger_entries"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_refund_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_allocation_status"
            referencedColumns: ["overhead_entry_id", "tenant_id"]
          },
          {
            foreignKeyName: "invoice_transaction_lines_transaction_entry_id_tenant_id_fkey"
            columns: ["transaction_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shared_overhead_ledger_current"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      trusted_transaction_history: {
        Row: {
          actor_user_id: string | null
          business_date: string | null
          cash_entry_id: string | null
          cash_reverses_entry_id: string | null
          cost_entry_id: string | null
          cost_reverses_entry_id: string | null
          created_at: string | null
          description: string | null
          display_amount: number | null
          import_batch_id: string | null
          import_row_id: string | null
          logical_transaction_id: string | null
          pool_id: string | null
          project_code: string | null
          project_id: string | null
          reference_number: string | null
          reversal_of_logical_id: string | null
          reversed_by_logical_id: string | null
          signed_cash_effect: number | null
          signed_project_cost_effect: number | null
          signed_shared_overhead_effect: number | null
          source: string | null
          status: string | null
          tenant_id: string | null
          transaction_direction: string | null
          transaction_type: string | null
          vessel_name: string | null
        }
        Relationships: []
      }
      unbilled_vessel_projects: {
        Row: {
          client_id: string | null
          closed_at: string | null
          last_void_reason: string | null
          last_voided_invoice_id: string | null
          project_id: string | null
          tenant_id: string | null
          unbilled_amount_total: number | null
          unbilled_transaction_count: number | null
          vessel_id: string | null
          vessel_name: string | null
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
      accept_tenant_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      allocate_shared_overhead_entry: {
        Args: {
          p_amount: number
          p_note?: string
          p_overhead_entry_id: string
          p_project_id: string
        }
        Returns: {
          actor_user_id: string | null
          allocation_kind: Database["public"]["Enums"]["shared_overhead_allocation_kind"]
          amount: number
          created_at: string
          id: string
          note: string | null
          overhead_entry_id: string
          project_id: string
          reverses_allocation_id: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shared_overhead_allocations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_and_commit_cash_import_batch: {
        Args: { p_batch_id: string }
        Returns: {
          business_date: string
          calculated_closing_balance: number
          canonical_cash_top_up_total: number | null
          canonical_closing_cash: number | null
          canonical_opening_cash: number | null
          canonical_project_expense_total: number | null
          canonical_project_refund_total: number | null
          canonical_shared_overhead_total: number | null
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          error_count: number
          id: string
          opening_balance: number
          rollback_reason: string | null
          rollback_reversal_count: number | null
          rollback_reversed_cash_effect: number | null
          rollback_reversed_project_cost: number | null
          rollback_reversed_refund_effect: number | null
          rollback_reversed_shared_overhead: number | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          source_filename: string
          source_sha256: string
          source_sheet_name: string
          status: Database["public"]["Enums"]["cash_import_batch_status"]
          tenant_id: string
          total_credit: number
          total_debit: number
          transaction_count: number
          updated_at: string
          warning_count: number
          workbook_closing_balance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_import_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_cash_reconciliation: {
        Args: { p_reconciliation_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          needs_correction_revision_id: string | null
          pool_id: string
          status: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      bind_invoice_transaction: {
        Args: { p_invoice_id: string; p_transaction_entry_id: string }
        Returns: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          project_id: string
          tenant_id: string
          transaction_category: string | null
          transaction_date: string | null
          transaction_entry_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_transaction_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_expense_submission: {
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
      claim_next_notification_event: {
        Args: { p_lease_seconds?: number; p_worker_id: string }
        Returns: {
          attempt_count: number
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          payload: Json
          provider_message_id: string | null
          sent_at: string | null
          source_event_id: string
          status: Database["public"]["Enums"]["notification_status"]
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_notification_event: {
        Args: {
          p_event_id: string
          p_provider_message_id?: string
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          payload: Json
          provider_message_id: string | null
          sent_at: string | null
          source_event_id: string
          status: Database["public"]["Enums"]["notification_status"]
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_cash_import_batch: {
        Args: {
          p_business_date: string
          p_opening_balance: number
          p_rows: Json
          p_source_filename: string
          p_source_sha256: string
          p_source_sheet_name: string
          p_tenant_id: string
          p_workbook_closing_balance: number
        }
        Returns: Database["public"]["CompositeTypes"]["cash_import_batch_creation_result"]
        SetofOptions: {
          from: "*"
          to: "cash_import_batch_creation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_cash_reconciliation_draft: {
        Args: {
          p_actual_counted_cash: number
          p_explanation?: string
          p_pool_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          needs_correction_revision_id: string | null
          pool_id: string
          status: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_draft_invoice: {
        Args: { p_project_id: string; p_tenant_id: string }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_expense_draft: {
        Args: {
          p_amount?: number
          p_category_id?: string
          p_description?: string
          p_entry_scope?: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          p_facility_location_id?: string
          p_pool_id: string
          p_project_id?: string
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
      create_tenant_invitation: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["tenant_role"]
          p_tenant_id: string
        }
        Returns: {
          invitation_id: string
          target_user_exists: boolean
        }[]
      }
      fail_notification_event: {
        Args: { p_error: string; p_event_id: string; p_worker_id: string }
        Returns: {
          attempt_count: number
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          payload: Json
          provider_message_id: string | null
          sent_at: string | null
          source_event_id: string
          status: Database["public"]["Enums"]["notification_status"]
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_invoice_evidence_version: {
        Args: {
          p_invoice_id: string
          p_mime_type: string
          p_sha256: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: {
          evidence_id: string
          id: string
          mime_type: string
          rejected_reason: string | null
          sha256: string
          size_bytes: number
          status: Database["public"]["Enums"]["invoice_evidence_version_status"]
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "invoice_evidence_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_invoice_summary: {
        Args: { p_invoice_id: string }
        Returns: {
          billing_completeness_status:
            | Database["public"]["Enums"]["invoice_billing_completeness_status"]
            | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          current_version_id: string | null
          current_version_number: number | null
          current_version_status:
            | Database["public"]["Enums"]["invoice_evidence_version_status"]
            | null
          due_date: string | null
          evidence_id: string | null
          id: string | null
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          is_final_document: boolean | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          line_count: number | null
          origin: Database["public"]["Enums"]["invoice_origin"] | null
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          successor_invoice_id: string | null
          tenant_id: string | null
          total_amount: number | null
          updated_at: string | null
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoice_billing_summary"
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
          daily_close_status: Database["public"]["Enums"]["cash_pool_daily_close_status"]
          financial_version: number
          id: string
          opening_cash_posted: boolean
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_pools"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_trusted_transaction_detail: {
        Args: { p_logical_transaction_id: string; p_tenant_id: string }
        Returns: {
          actor_user_id: string | null
          business_date: string | null
          cash_entry_id: string | null
          cash_reverses_entry_id: string | null
          cost_entry_id: string | null
          cost_reverses_entry_id: string | null
          created_at: string | null
          description: string | null
          display_amount: number | null
          import_batch_id: string | null
          import_row_id: string | null
          logical_transaction_id: string | null
          pool_id: string | null
          project_code: string | null
          project_id: string | null
          reference_number: string | null
          reversal_of_logical_id: string | null
          reversed_by_logical_id: string | null
          signed_cash_effect: number | null
          signed_project_cost_effect: number | null
          signed_shared_overhead_effect: number | null
          source: string | null
          status: string | null
          tenant_id: string | null
          transaction_direction: string | null
          transaction_type: string | null
          vessel_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trusted_transaction_history"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_unresolved_expense_count: {
        Args: { p_pool_id: string }
        Returns: number
      }
      issue_invoice: {
        Args: { p_invoice_id: string }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_invoice_eligible_transactions: {
        Args: { p_project_id?: string; p_tenant_id: string }
        Returns: {
          amount: number | null
          created_at: string | null
          description: string | null
          project_code: string | null
          project_id: string | null
          tenant_id: string | null
          transaction_entry_id: string | null
          vessel_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_eligible_transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_invoices: {
        Args: {
          p_limit?: number
          p_status?: Database["public"]["Enums"]["invoice_status"]
          p_tenant_id: string
        }
        Returns: {
          billing_completeness_status:
            | Database["public"]["Enums"]["invoice_billing_completeness_status"]
            | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          current_version_id: string | null
          current_version_number: number | null
          current_version_status:
            | Database["public"]["Enums"]["invoice_evidence_version_status"]
            | null
          due_date: string | null
          evidence_id: string | null
          id: string | null
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          is_final_document: boolean | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          line_count: number | null
          origin: Database["public"]["Enums"]["invoice_origin"] | null
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          successor_invoice_id: string | null
          tenant_id: string | null
          total_amount: number | null
          updated_at: string | null
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_billing_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_transaction_invoice_bindings: {
        Args: { p_tenant_id: string; p_transaction_entry_id: string }
        Returns: {
          amount: number | null
          binding_id: string | null
          bound_at: string | null
          current_version_id: string | null
          current_version_status:
            | Database["public"]["Enums"]["invoice_evidence_version_status"]
            | null
          description: string | null
          invoice_id: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"] | null
          is_final_document: boolean | null
          predecessor_invoice_id: string | null
          tenant_id: string | null
          transaction_entry_id: string | null
          void_reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "transaction_invoice_bindings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_trusted_transactions: {
        Args: {
          p_cursor_business_date?: string
          p_cursor_created_at?: string
          p_cursor_logical_id?: string
          p_date_from?: string
          p_date_to?: string
          p_import_batch_id?: string
          p_limit?: number
          p_project_id?: string
          p_search?: string
          p_source?: string
          p_status?: string
          p_tenant_id: string
          p_transaction_direction?: string
          p_transaction_type?: string
        }
        Returns: {
          actor_user_id: string | null
          business_date: string | null
          cash_entry_id: string | null
          cash_reverses_entry_id: string | null
          cost_entry_id: string | null
          cost_reverses_entry_id: string | null
          created_at: string | null
          description: string | null
          display_amount: number | null
          import_batch_id: string | null
          import_row_id: string | null
          logical_transaction_id: string | null
          pool_id: string | null
          project_code: string | null
          project_id: string | null
          reference_number: string | null
          reversal_of_logical_id: string | null
          reversed_by_logical_id: string | null
          signed_cash_effect: number | null
          signed_project_cost_effect: number | null
          signed_shared_overhead_effect: number | null
          source: string | null
          status: string | null
          tenant_id: string | null
          transaction_direction: string | null
          transaction_type: string | null
          vessel_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trusted_transaction_history"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_unbilled_vessel_projects: {
        Args: { p_tenant_id: string }
        Returns: {
          client_id: string | null
          closed_at: string | null
          last_void_reason: string | null
          last_voided_invoice_id: string | null
          project_id: string | null
          tenant_id: string | null
          unbilled_amount_total: number | null
          unbilled_transaction_count: number | null
          vessel_id: string | null
          vessel_name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "unbilled_vessel_projects"
          isOneToOne: false
          isSetofReturn: true
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
      log_own_password_reset_completed: { Args: never; Returns: undefined }
      mark_cash_import_batch_ready_for_review: {
        Args: { p_batch_id: string }
        Returns: {
          business_date: string
          calculated_closing_balance: number
          canonical_cash_top_up_total: number | null
          canonical_closing_cash: number | null
          canonical_opening_cash: number | null
          canonical_project_expense_total: number | null
          canonical_project_refund_total: number | null
          canonical_shared_overhead_total: number | null
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          error_count: number
          id: string
          opening_balance: number
          rollback_reason: string | null
          rollback_reversal_count: number | null
          rollback_reversed_cash_effect: number | null
          rollback_reversed_project_cost: number | null
          rollback_reversed_refund_effect: number | null
          rollback_reversed_shared_overhead: number | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          source_filename: string
          source_sha256: string
          source_sheet_name: string
          status: Database["public"]["Enums"]["cash_import_batch_status"]
          tenant_id: string
          total_credit: number
          total_debit: number
          transaction_count: number
          updated_at: string
          warning_count: number
          workbook_closing_balance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_import_batches"
          isOneToOne: true
          isSetofReturn: false
        }
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
          import_batch_id: string | null
          import_row_id: string | null
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
      record_invoice_delivery_event: {
        Args: {
          p_acknowledgment_note?: string
          p_channel: Database["public"]["Enums"]["invoice_delivery_event_channel"]
          p_event_type: Database["public"]["Enums"]["invoice_delivery_event_type"]
          p_failure_reason?: string
          p_invoice_id: string
          p_provider_reference?: string
          p_recipient_snapshot: string
        }
        Returns: {
          acknowledgment_note: string | null
          channel: Database["public"]["Enums"]["invoice_delivery_event_channel"]
          created_at: string
          event_seq: number
          event_type: Database["public"]["Enums"]["invoice_delivery_event_type"]
          failure_reason: string | null
          id: string
          invoice_id: string
          provider_reference: string | null
          recipient_snapshot: string
          recorded_by: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_delivery_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_invoice_evidence_access: {
        Args: { p_version_id: string }
        Returns: {
          evidence_id: string
          id: string
          mime_type: string
          rejected_reason: string | null
          sha256: string
          size_bytes: number
          status: Database["public"]["Enums"]["invoice_evidence_version_status"]
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "invoice_evidence_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_project_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_facility_location_id?: string
          p_pool_id: string
          p_project_id: string
          p_reference_number?: string
          p_vendor_id?: string
        }
        Returns: {
          actor_user_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          description: string
          entry_kind: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          entry_scope: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id: string | null
          id: string
          import_batch_id: string | null
          import_row_id: string | null
          pool_id: string
          project_id: string | null
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
      record_shared_overhead_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_facility_location_id?: string
          p_pool_id: string
          p_reference_number?: string
          p_vendor_id?: string
        }
        Returns: {
          actor_user_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          description: string
          entry_kind: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          entry_scope: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id: string | null
          id: string
          import_batch_id: string | null
          import_row_id: string | null
          pool_id: string
          project_id: string | null
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
      register_invoice_number: {
        Args: { p_invoice_id: string; p_invoice_number: string }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_legacy_invoice: {
        Args: {
          p_due_date: string
          p_invoice_date: string
          p_invoice_number: string
          p_legacy_coverage_status?: Database["public"]["Enums"]["invoice_legacy_coverage_status"]
          p_legal_entity_id: string
          p_project_id: string
          p_status: Database["public"]["Enums"]["invoice_status"]
          p_tenant_id: string
          p_transaction_entry_ids?: string[]
          p_void_reason?: string
        }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reissue_invoice: {
        Args: { p_predecessor_invoice_id: string; p_project_id?: string }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_cash_import_batch: {
        Args: { p_batch_id: string; p_reason: string }
        Returns: {
          business_date: string
          calculated_closing_balance: number
          canonical_cash_top_up_total: number | null
          canonical_closing_cash: number | null
          canonical_opening_cash: number | null
          canonical_project_expense_total: number | null
          canonical_project_refund_total: number | null
          canonical_shared_overhead_total: number | null
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          error_count: number
          id: string
          opening_balance: number
          rollback_reason: string | null
          rollback_reversal_count: number | null
          rollback_reversed_cash_effect: number | null
          rollback_reversed_project_cost: number | null
          rollback_reversed_refund_effect: number | null
          rollback_reversed_shared_overhead: number | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          source_filename: string
          source_sha256: string
          source_sheet_name: string
          status: Database["public"]["Enums"]["cash_import_batch_status"]
          tenant_id: string
          total_credit: number
          total_debit: number
          transaction_count: number
          updated_at: string
          warning_count: number
          workbook_closing_balance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_import_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_cash_reconciliation: {
        Args: { p_reason: string; p_reconciliation_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          needs_correction_revision_id: string | null
          pool_id: string
          status: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliations"
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
      reject_invoice_evidence_version: {
        Args: { p_reason: string; p_version_id: string }
        Returns: {
          evidence_id: string
          id: string
          mime_type: string
          rejected_reason: string | null
          sha256: string
          size_bytes: number
          status: Database["public"]["Enums"]["invoice_evidence_version_status"]
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "invoice_evidence_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_cash_pool: {
        Args: { p_pool_id: string; p_reason: string }
        Returns: {
          business_date: string
          created_at: string
          created_by: string | null
          daily_close_status: Database["public"]["Enums"]["cash_pool_daily_close_status"]
          financial_version: number
          id: string
          opening_cash_posted: boolean
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_pools"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_cash_reconciliation_correction: {
        Args: { p_reason: string; p_reconciliation_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          needs_correction_revision_id: string | null
          pool_id: string
          status: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliations"
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
      resolve_expense_duplicate_candidate: {
        Args: {
          p_candidate_id: string
          p_reason: string
          p_resolution: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
        }
        Returns: {
          detected_at: string
          id: string
          match_evidence: Json
          reason_code: Database["public"]["Enums"]["expense_duplicate_reason_code"]
          resolved_at: string | null
          resolved_by: string | null
          resolved_reason: string | null
          revision_id_1: string
          revision_id_2: string
          status: Database["public"]["Enums"]["expense_duplicate_candidate_status"]
          submission_id_1: string
          submission_id_2: string
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "expense_duplicate_candidates"
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
          import_batch_id: string | null
          import_row_id: string | null
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
      reverse_paired_project_refund: {
        Args: {
          p_cash_entry_id: string
          p_cost_entry_id: string
          p_reason: string
        }
        Returns: {
          cash_reversal_id: string
          cost_reversal_id: string
          result_status: string
        }[]
      }
      reverse_project_expense: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: {
          actor_user_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          description: string
          entry_kind: Database["public"]["Enums"]["project_cost_ledger_entry_kind"]
          entry_scope: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          facility_location_id: string | null
          id: string
          import_batch_id: string | null
          import_row_id: string | null
          pool_id: string
          project_id: string | null
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
      reverse_shared_overhead_allocation: {
        Args: { p_allocation_id: string; p_reason: string }
        Returns: {
          actor_user_id: string | null
          allocation_kind: Database["public"]["Enums"]["shared_overhead_allocation_kind"]
          amount: number
          created_at: string
          id: string
          note: string | null
          overhead_entry_id: string
          project_id: string
          reverses_allocation_id: string | null
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shared_overhead_allocations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revise_cash_reconciliation_draft: {
        Args: {
          p_actual_counted_cash: number
          p_explanation?: string
          p_reconciliation_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          needs_correction_revision_id: string | null
          pool_id: string
          status: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revise_expense_draft: {
        Args: {
          p_amount?: number
          p_category_id?: string
          p_description?: string
          p_entry_scope?: Database["public"]["Enums"]["project_cost_ledger_entry_scope"]
          p_facility_location_id?: string
          p_pool_id: string
          p_project_id?: string
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
      rollback_cash_import_batch: {
        Args: { p_batch_id: string; p_reason: string }
        Returns: {
          business_date: string
          calculated_closing_balance: number
          canonical_cash_top_up_total: number | null
          canonical_closing_cash: number | null
          canonical_opening_cash: number | null
          canonical_project_expense_total: number | null
          canonical_project_refund_total: number | null
          canonical_shared_overhead_total: number | null
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string | null
          error_count: number
          id: string
          opening_balance: number
          rollback_reason: string | null
          rollback_reversal_count: number | null
          rollback_reversed_cash_effect: number | null
          rollback_reversed_project_cost: number | null
          rollback_reversed_refund_effect: number | null
          rollback_reversed_shared_overhead: number | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          source_filename: string
          source_sha256: string
          source_sheet_name: string
          status: Database["public"]["Enums"]["cash_import_batch_status"]
          tenant_id: string
          total_credit: number
          total_debit: number
          transaction_count: number
          updated_at: string
          warning_count: number
          workbook_closing_balance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_import_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_cash_import_label_mapping: {
        Args: {
          p_batch_id: string
          p_mapped_vessel_project_id?: string
          p_mapping_kind: Database["public"]["Enums"]["cash_import_mapping_kind"]
          p_vessel_label: string
        }
        Returns: number
      }
      set_cash_import_row_disposition: {
        Args: {
          p_disposition: Database["public"]["Enums"]["cash_import_row_disposition"]
          p_disposition_reason?: string
          p_row_id: string
        }
        Returns: {
          batch_id: string
          calculated_balance: number | null
          created_at: string
          credit: number | null
          debit: number | null
          description: string | null
          disposition:
            | Database["public"]["Enums"]["cash_import_row_disposition"]
            | null
          disposition_reason: string | null
          duplicate_group_key: string | null
          id: string
          mapped_vessel_project_id: string | null
          mapping_kind:
            | Database["public"]["Enums"]["cash_import_mapping_kind"]
            | null
          provisional_classification: Database["public"]["Enums"]["cash_import_provisional_classification"]
          source_fingerprint: string
          source_row_number: number
          status: Database["public"]["Enums"]["cash_import_row_status"]
          tenant_id: string
          updated_at: string
          validation_issues: Json
          vessel_label: string | null
          workbook_balance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_import_rows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_membership_role: {
        Args: {
          p_membership_id: string
          p_role: Database["public"]["Enums"]["tenant_role"]
        }
        Returns: undefined
      }
      set_membership_status: {
        Args: {
          p_membership_id: string
          p_status: Database["public"]["Enums"]["membership_status"]
        }
        Returns: undefined
      }
      set_vessel_project_priority: {
        Args: {
          p_priority: Database["public"]["Enums"]["vessel_project_priority"]
          p_project_id: string
        }
        Returns: {
          client_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          facility_location_id: string | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          priority: Database["public"]["Enums"]["vessel_project_priority"]
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
      submit_cash_reconciliation: {
        Args: { p_reconciliation_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          current_revision_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          needs_correction_revision_id: string | null
          pool_id: string
          status: Database["public"]["Enums"]["cash_reconciliation_status"]
          submitted_at: string | null
          submitted_by: string | null
          submitted_cash_top_up: number | null
          submitted_expected_closing_cash: number | null
          submitted_financial_version: number | null
          submitted_opening_cash: number | null
          submitted_other_cash_in: number | null
          submitted_total_cash_out: number | null
          submitted_variance: number | null
          superseded_at: string | null
          superseded_by_reopen_event_id: string | null
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliations"
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
      summarize_trusted_transactions: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_import_batch_id?: string
          p_project_id?: string
          p_search?: string
          p_source?: string
          p_status?: string
          p_tenant_id: string
          p_transaction_direction?: string
          p_transaction_type?: string
        }
        Returns: {
          net_cash_effect: number
          net_project_cost_effect: number
          total_cash_in: number
          total_cash_out: number
          total_project_cost_increase: number
          total_project_cost_reduction: number
          total_shared_overhead: number
          transaction_count: number
        }[]
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
          facility_location_id: string | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["vessel_project_lifecycle_status"]
          priority: Database["public"]["Enums"]["vessel_project_priority"]
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
      unbind_invoice_transaction: {
        Args: { p_line_id: string }
        Returns: undefined
      }
      update_invoice_billing_metadata: {
        Args: {
          p_due_date: string
          p_invoice_date: string
          p_invoice_id: string
          p_legal_entity_id: string
        }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_invoice_evidence_version: {
        Args: { p_version_id: string }
        Returns: {
          evidence_id: string
          id: string
          mime_type: string
          rejected_reason: string | null
          sha256: string
          size_bytes: number
          status: Database["public"]["Enums"]["invoice_evidence_version_status"]
          storage_path: string
          tenant_id: string
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "invoice_evidence_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: {
          client_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invoice_date: string | null
          invoice_number: string | null
          issued_at: string | null
          issued_by: string | null
          legacy_coverage_status:
            | Database["public"]["Enums"]["invoice_legacy_coverage_status"]
            | null
          legal_entity_id: string | null
          origin: Database["public"]["Enums"]["invoice_origin"]
          predecessor_invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tenant_id: string
          updated_at: string
          void_at: string | null
          void_by: string | null
          void_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      cash_import_batch_status:
        | "draft"
        | "mapping_required"
        | "ready_for_review"
        | "superseded"
        | "committed"
        | "rolled_back"
      cash_import_mapping_kind:
        | "cash"
        | "existing_vessel_project"
        | "new_project_candidate"
        | "shared_overhead"
        | "unresolved"
      cash_import_provisional_classification:
        | "opening_cash"
        | "cash_top_up_candidate"
        | "project_cash_in_or_refund_review"
        | "project_expense_candidate"
        | "unallocated_expense_review"
        | "manual_mapping_required"
      cash_import_row_disposition: "include" | "skip" | "manual_review"
      cash_import_row_status: "valid" | "warning" | "error"
      cash_pool_daily_close_status: "open" | "pending_close" | "closed"
      cash_pool_entry_kind: "entry" | "reversal"
      cash_pool_entry_type:
        | "opening_cash"
        | "cash_top_up"
        | "other_cash_in"
        | "project_refund"
      cash_reconciliation_status:
        | "draft"
        | "submitted"
        | "approved"
        | "needs_correction"
        | "rejected"
      client_contact_role:
        | "operational"
        | "billing"
        | "finance"
        | "approver"
        | "other"
      expense_duplicate_candidate_status:
        | "pending"
        | "not_duplicate"
        | "confirmed_duplicate"
      expense_duplicate_reason_code:
        | "reference_match"
        | "exact_financial_match"
        | "cross_project_reference_match"
        | "same_day_amount_vendor_match"
      expense_submission_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "needs_correction"
        | "cancelled"
      invoice_billing_completeness_status:
        | "DRAFT_INCOMPLETE"
        | "DRAFT_READY_TO_ISSUE"
        | "ISSUED_EVIDENCE_PENDING"
        | "READY_TO_SEND"
        | "VOID"
        | "LEGACY_RECORDED"
      invoice_delivery_channel: "whatsapp" | "email" | "both"
      invoice_delivery_event_channel: "email" | "whatsapp" | "manual"
      invoice_delivery_event_type:
        | "sent"
        | "delivered"
        | "acknowledged"
        | "failed"
      invoice_evidence_kind: "signed_invoice"
      invoice_evidence_version_status: "pending" | "verified" | "rejected"
      invoice_legacy_coverage_status: "full" | "partial" | "unknown"
      invoice_origin: "native" | "legacy_import"
      invoice_status: "draft" | "issued" | "void"
      legal_entity_status: "active" | "inactive"
      membership_status: "invited" | "active" | "suspended"
      notification_event_type: "import_review_requested" | "import_approved"
      notification_status: "pending" | "processing" | "sent" | "failed"
      project_cost_ledger_entry_kind: "expense" | "reversal" | "refund"
      project_cost_ledger_entry_scope: "project" | "shared_overhead"
      record_status: "active" | "inactive"
      shared_overhead_allocation_kind: "allocation" | "reversal"
      tenant_invitation_status: "pending" | "accepted" | "expired"
      tenant_role: "owner" | "admin" | "reviewer" | "viewer"
      tenant_status: "active" | "suspended"
      vessel_project_lifecycle_status: "active" | "ready_to_close" | "closed"
      vessel_project_priority: "emergency" | "standard" | "urgent"
    }
    CompositeTypes: {
      cash_import_batch_creation_result: {
        batch: Database["public"]["Tables"]["cash_import_batches"]["Row"] | null
        is_new: boolean | null
      }
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
      cash_import_batch_status: [
        "draft",
        "mapping_required",
        "ready_for_review",
        "superseded",
        "committed",
        "rolled_back",
      ],
      cash_import_mapping_kind: [
        "cash",
        "existing_vessel_project",
        "new_project_candidate",
        "shared_overhead",
        "unresolved",
      ],
      cash_import_provisional_classification: [
        "opening_cash",
        "cash_top_up_candidate",
        "project_cash_in_or_refund_review",
        "project_expense_candidate",
        "unallocated_expense_review",
        "manual_mapping_required",
      ],
      cash_import_row_disposition: ["include", "skip", "manual_review"],
      cash_import_row_status: ["valid", "warning", "error"],
      cash_pool_daily_close_status: ["open", "pending_close", "closed"],
      cash_pool_entry_kind: ["entry", "reversal"],
      cash_pool_entry_type: [
        "opening_cash",
        "cash_top_up",
        "other_cash_in",
        "project_refund",
      ],
      cash_reconciliation_status: [
        "draft",
        "submitted",
        "approved",
        "needs_correction",
        "rejected",
      ],
      client_contact_role: [
        "operational",
        "billing",
        "finance",
        "approver",
        "other",
      ],
      expense_duplicate_candidate_status: [
        "pending",
        "not_duplicate",
        "confirmed_duplicate",
      ],
      expense_duplicate_reason_code: [
        "reference_match",
        "exact_financial_match",
        "cross_project_reference_match",
        "same_day_amount_vendor_match",
      ],
      expense_submission_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "needs_correction",
        "cancelled",
      ],
      invoice_billing_completeness_status: [
        "DRAFT_INCOMPLETE",
        "DRAFT_READY_TO_ISSUE",
        "ISSUED_EVIDENCE_PENDING",
        "READY_TO_SEND",
        "VOID",
        "LEGACY_RECORDED",
      ],
      invoice_delivery_channel: ["whatsapp", "email", "both"],
      invoice_delivery_event_channel: ["email", "whatsapp", "manual"],
      invoice_delivery_event_type: [
        "sent",
        "delivered",
        "acknowledged",
        "failed",
      ],
      invoice_evidence_kind: ["signed_invoice"],
      invoice_evidence_version_status: ["pending", "verified", "rejected"],
      invoice_legacy_coverage_status: ["full", "partial", "unknown"],
      invoice_origin: ["native", "legacy_import"],
      invoice_status: ["draft", "issued", "void"],
      legal_entity_status: ["active", "inactive"],
      membership_status: ["invited", "active", "suspended"],
      notification_event_type: ["import_review_requested", "import_approved"],
      notification_status: ["pending", "processing", "sent", "failed"],
      project_cost_ledger_entry_kind: ["expense", "reversal", "refund"],
      project_cost_ledger_entry_scope: ["project", "shared_overhead"],
      record_status: ["active", "inactive"],
      shared_overhead_allocation_kind: ["allocation", "reversal"],
      tenant_invitation_status: ["pending", "accepted", "expired"],
      tenant_role: ["owner", "admin", "reviewer", "viewer"],
      tenant_status: ["active", "suspended"],
      vessel_project_lifecycle_status: ["active", "ready_to_close", "closed"],
      vessel_project_priority: ["emergency", "standard", "urgent"],
    },
  },
} as const

