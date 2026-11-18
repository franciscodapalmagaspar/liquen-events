export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_state: {
        Row: {
          key: string;
          updated_at: string;
          value: Json | null;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value?: Json | null;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json | null;
        };
        Relationships: [];
      };
      biblioteca_etiquetas: {
        Row: {
          created_at: string;
          eixo: string;
          id: string;
          nome: string;
          ordem: number;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          eixo: string;
          id: string;
          nome: string;
          ordem?: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          eixo?: string;
          id?: string;
          nome?: string;
          ordem?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      biblioteca_foto_etiquetas: {
        Row: {
          created_at: string;
          etiqueta_id: string;
          id: string;
          origem: string;
          path: string;
        };
        Insert: {
          created_at?: string;
          etiqueta_id: string;
          id?: string;
          origem?: string;
          path: string;
        };
        Update: {
          created_at?: string;
          etiqueta_id?: string;
          id?: string;
          origem?: string;
          path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "biblioteca_foto_etiquetas_etiqueta_id_fkey";
            columns: ["etiqueta_id"];
            isOneToOne: false;
            referencedRelation: "biblioteca_etiquetas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "biblioteca_foto_etiquetas_path_fkey";
            columns: ["path"];
            isOneToOne: false;
            referencedRelation: "biblioteca_fotos";
            referencedColumns: ["path"];
          },
        ];
      };
      biblioteca_fotos: {
        Row: {
          altura: number | null;
          cor: string | null;
          created_at: string;
          fingerprint: string | null;
          largura: number | null;
          lqip: string | null;
          md5: string | null;
          pasta: string | null;
          path: string;
          updated_at: string;
          urls: Json | null;
        };
        Insert: {
          altura?: number | null;
          cor?: string | null;
          created_at?: string;
          fingerprint?: string | null;
          largura?: number | null;
          lqip?: string | null;
          md5?: string | null;
          pasta?: string | null;
          path: string;
          updated_at?: string;
          urls?: Json | null;
        };
        Update: {
          altura?: number | null;
          cor?: string | null;
          created_at?: string;
          fingerprint?: string | null;
          largura?: number | null;
          lqip?: string | null;
          md5?: string | null;
          pasta?: string | null;
          path?: string;
          updated_at?: string;
          urls?: Json | null;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          created_at: string;
          event_date: string;
          event_time: string | null;
          id: string;
          kind: string;
          note: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          event_date: string;
          event_time?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          event_date?: string;
          event_time?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      contracts: {
        Row: {
          accepted_at: string | null;
          accepted_ip: string | null;
          accepted_name: string | null;
          client_email: string | null;
          client_name: string | null;
          created_at: string;
          id: string;
          idioma: string | null;
          proposal_id: string | null;
          proposta_pdf_bytes: number | null;
          proposta_pdf_sha256: string | null;
          proposta_versao_numero: number | null;
          proposta_versao_selo: string | null;
          quote_id: string | null;
          registado_como: string | null;
          registado_por: string | null;
          status: string;
          terms_snapshot: string | null;
          terms_version: string | null;
          updated_at: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_ip?: string | null;
          accepted_name?: string | null;
          client_email?: string | null;
          client_name?: string | null;
          created_at?: string;
          id: string;
          idioma?: string | null;
          proposal_id?: string | null;
          proposta_pdf_bytes?: number | null;
          proposta_pdf_sha256?: string | null;
          proposta_versao_numero?: number | null;
          proposta_versao_selo?: string | null;
          quote_id?: string | null;
          registado_como?: string | null;
          registado_por?: string | null;
          status?: string;
          terms_snapshot?: string | null;
          terms_version?: string | null;
          updated_at?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_ip?: string | null;
          accepted_name?: string | null;
          client_email?: string | null;
          client_name?: string | null;
          created_at?: string;
          id?: string;
          idioma?: string | null;
          proposal_id?: string | null;
          proposta_pdf_bytes?: number | null;
          proposta_pdf_sha256?: string | null;
          proposta_versao_numero?: number | null;
          proposta_versao_selo?: string | null;
          quote_id?: string | null;
          registado_como?: string | null;
          registado_por?: string | null;
          status?: string;
          terms_snapshot?: string | null;
          terms_version?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contracts_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      email_templates: {
        Row: {
          body: string;
          id: string;
          name: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          id: string;
          name: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          id?: string;
          name?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_material: {
        Row: {
          generated_at: string;
          id: string;
          notes: string | null;
          quote_id: string;
          status: string;
          updated_at: string;
          vehicles: Json;
        };
        Insert: {
          generated_at?: string;
          id: string;
          notes?: string | null;
          quote_id: string;
          status?: string;
          updated_at?: string;
          vehicles?: Json;
        };
        Update: {
          generated_at?: string;
          id?: string;
          notes?: string | null;
          quote_id?: string;
          status?: string;
          updated_at?: string;
          vehicles?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "event_material_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      event_material_items: {
        Row: {
          category: string;
          critical: boolean;
          event_id: string;
          id: string;
          item_id: string | null;
          kind: string;
          loaded_at: string | null;
          loaded_by: string | null;
          missing: boolean;
          name: string;
          note: string | null;
          origin: string;
          origin_label: string;
          origin_ref: string | null;
          qty: number;
          returned_at: string | null;
          returned_by: string | null;
          unit: string | null;
          updated_at: string | null;
          used_qty: number | null;
          vehicle_id: string | null;
        };
        Insert: {
          category: string;
          critical?: boolean;
          event_id: string;
          id: string;
          item_id?: string | null;
          kind: string;
          loaded_at?: string | null;
          loaded_by?: string | null;
          missing?: boolean;
          name: string;
          note?: string | null;
          origin: string;
          origin_label?: string;
          origin_ref?: string | null;
          qty: number;
          returned_at?: string | null;
          returned_by?: string | null;
          unit?: string | null;
          updated_at?: string | null;
          used_qty?: number | null;
          vehicle_id?: string | null;
        };
        Update: {
          category?: string;
          critical?: boolean;
          event_id?: string;
          id?: string;
          item_id?: string | null;
          kind?: string;
          loaded_at?: string | null;
          loaded_by?: string | null;
          missing?: boolean;
          name?: string;
          note?: string | null;
          origin?: string;
          origin_label?: string;
          origin_ref?: string | null;
          qty?: number;
          returned_at?: string | null;
          returned_by?: string | null;
          unit?: string | null;
          updated_at?: string | null;
          used_qty?: number | null;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_material_items_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event_material";
            referencedColumns: ["id"];
          },
        ];
      };
      event_material_log: {
        Row: {
          action: string;
          actor: string;
          event_id: string;
          id: string;
          item_id: string;
          marked_at: string;
          superseded: boolean;
          synced_at: string;
          value: string | null;
        };
        Insert: {
          action: string;
          actor: string;
          event_id: string;
          id: string;
          item_id: string;
          marked_at: string;
          superseded?: boolean;
          synced_at?: string;
          value?: string | null;
        };
        Update: {
          action?: string;
          actor?: string;
          event_id?: string;
          id?: string;
          item_id?: string;
          marked_at?: string;
          superseded?: boolean;
          synced_at?: string;
          value?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_material_log_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event_material";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_items: {
        Row: {
          category: string;
          condition: string;
          id: string;
          location: string | null;
          name: string;
          notes: string | null;
          quantity: number;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          category?: string;
          condition?: string;
          id: string;
          location?: string | null;
          name: string;
          notes?: string | null;
          quantity?: number;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string;
          condition?: string;
          id?: string;
          location?: string | null;
          name?: string;
          notes?: string | null;
          quantity?: number;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      invoice_counters: {
        Row: {
          n: number;
          year: number;
        };
        Insert: {
          n?: number;
          year: number;
        };
        Update: {
          n?: number;
          year?: number;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          amount: number;
          client_email: string | null;
          client_name: string | null;
          due_at: string | null;
          id: string;
          issued_at: string | null;
          kind: string;
          note: string | null;
          number: string;
          paid_at: string | null;
          quote_id: string | null;
          status: string;
          updated_at: string | null;
          vat_rate: number;
        };
        Insert: {
          amount?: number;
          client_email?: string | null;
          client_name?: string | null;
          due_at?: string | null;
          id: string;
          issued_at?: string | null;
          kind?: string;
          note?: string | null;
          number: string;
          paid_at?: string | null;
          quote_id?: string | null;
          status?: string;
          updated_at?: string | null;
          vat_rate?: number;
        };
        Update: {
          amount?: number;
          client_email?: string | null;
          client_name?: string | null;
          due_at?: string | null;
          id?: string;
          issued_at?: string | null;
          kind?: string;
          note?: string | null;
          number?: string;
          paid_at?: string | null;
          quote_id?: string | null;
          status?: string;
          updated_at?: string | null;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      ligacoes_de_proposta: {
        Row: {
          atual: boolean;
          codigo: string;
          criada_em: string;
          expira_em: string | null;
          proposal_id: string;
          revogada_em: string | null;
        };
        Insert: {
          atual?: boolean;
          codigo: string;
          criada_em: string;
          expira_em?: string | null;
          proposal_id: string;
          revogada_em?: string | null;
        };
        Update: {
          atual?: boolean;
          codigo?: string;
          criada_em?: string;
          expira_em?: string | null;
          proposal_id?: string;
          revogada_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ligacoes_de_proposta_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      material_items: {
        Row: {
          category: string;
          id: string;
          kind: string;
          min_stock: number | null;
          name: string;
          notes: string | null;
          photo_path: string | null;
          stock: number;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          category?: string;
          id: string;
          kind?: string;
          min_stock?: number | null;
          name: string;
          notes?: string | null;
          photo_path?: string | null;
          stock?: number;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string;
          id?: string;
          kind?: string;
          min_stock?: number | null;
          name?: string;
          notes?: string | null;
          photo_path?: string | null;
          stock?: number;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      material_list_items: {
        Row: {
          critical: boolean;
          id: string;
          item_id: string;
          list_id: string;
          position: number;
          qty: number;
          qty_per_pax: number | null;
          updated_at: string | null;
        };
        Insert: {
          critical?: boolean;
          id: string;
          item_id: string;
          list_id: string;
          position?: number;
          qty?: number;
          qty_per_pax?: number | null;
          updated_at?: string | null;
        };
        Update: {
          critical?: boolean;
          id?: string;
          item_id?: string;
          list_id?: string;
          position?: number;
          qty?: number;
          qty_per_pax?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "material_list_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "material_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "material_list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "material_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      material_lists: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          is_default?: boolean;
          name: string;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      material_rules: {
        Row: {
          action: string;
          enabled: boolean;
          id: string;
          item_id: string | null;
          list_id: string | null;
          match_kind: string;
          match_value: string | null;
          name: string;
          position: number;
          qty: number | null;
          qty_per_pax: number | null;
          updated_at: string;
        };
        Insert: {
          action?: string;
          enabled?: boolean;
          id: string;
          item_id?: string | null;
          list_id?: string | null;
          match_kind: string;
          match_value?: string | null;
          name: string;
          position?: number;
          qty?: number | null;
          qty_per_pax?: number | null;
          updated_at?: string;
        };
        Update: {
          action?: string;
          enabled?: boolean;
          id?: string;
          item_id?: string | null;
          list_id?: string | null;
          match_kind?: string;
          match_value?: string | null;
          name?: string;
          position?: number;
          qty?: number | null;
          qty_per_pax?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "material_rules_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "material_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "material_rules_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "material_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      message_links: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          labels: Json;
          pinned: boolean;
          proposal_id: string | null;
          quote_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id: string;
          labels?: Json;
          pinned?: boolean;
          proposal_id?: string | null;
          quote_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          labels?: Json;
          pinned?: boolean;
          proposal_id?: string | null;
          quote_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "message_links_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "proposals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_links_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      overview_settings: {
        Row: {
          id: string;
          revision: number;
          updated_at: string;
          value: string;
        };
        Insert: {
          id: string;
          revision?: number;
          updated_at?: string;
          value?: string;
        };
        Update: {
          id?: string;
          revision?: number;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      passkeys: {
        Row: {
          counter: number;
          created_at: string;
          device_label: string;
          id: string;
          last_used_at: string | null;
          public_key: string;
          rp_id: string;
          transports: Json;
          user_name: string;
        };
        Insert: {
          counter?: number;
          created_at?: string;
          device_label?: string;
          id: string;
          last_used_at?: string | null;
          public_key: string;
          rp_id: string;
          transports?: Json;
          user_name: string;
        };
        Update: {
          counter?: number;
          created_at?: string;
          device_label?: string;
          id?: string;
          last_used_at?: string | null;
          public_key?: string;
          rp_id?: string;
          transports?: Json;
          user_name?: string;
        };
        Relationships: [];
      };
      proposal_settings: {
        Row: {
          id: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          id: string;
          updated_at?: string;
          value?: Json;
        };
        Update: {
          id?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      proposal_themes: {
        Row: {
          arquivado: boolean;
          cover_path: string | null;
          created_at: string;
          favorito: boolean;
          filter_rule: Json | null;
          id: string;
          kind: string;
          manual_paths: Json | null;
          name: string;
          notes: string | null;
          ordem: number | null;
          photo_order: Json | null;
          updated_at: string;
        };
        Insert: {
          arquivado?: boolean;
          cover_path?: string | null;
          created_at?: string;
          favorito?: boolean;
          filter_rule?: Json | null;
          id: string;
          kind?: string;
          manual_paths?: Json | null;
          name: string;
          notes?: string | null;
          ordem?: number | null;
          photo_order?: Json | null;
          updated_at?: string;
        };
        Update: {
          arquivado?: boolean;
          cover_path?: string | null;
          created_at?: string;
          favorito?: boolean;
          filter_rule?: Json | null;
          id?: string;
          kind?: string;
          manual_paths?: Json | null;
          name?: string;
          notes?: string | null;
          ordem?: number | null;
          photo_order?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      proposals: {
        Row: {
          chosen_version: string | null;
          client_email: string | null;
          client_name: string | null;
          created_at: string;
          currency: string;
          doc: Json | null;
          follow_up_at: string | null;
          follow_up_note: string | null;
          id: string;
          idioma: string | null;
          line_items: Json;
          lost_note: string | null;
          lost_reason: string | null;
          notes: string | null;
          pdf_bytes: number | null;
          pdf_sha256: string | null;
          quote_id: string | null;
          responded_at: string | null;
          sent_at: string | null;
          status: string;
          subtotal: number;
          total: number;
          updated_at: string | null;
          valid_until: string | null;
          vat: number;
          vat_rate: number;
          versao_em: string | null;
          versao_numero: number | null;
          versao_selo: string | null;
        };
        Insert: {
          chosen_version?: string | null;
          client_email?: string | null;
          client_name?: string | null;
          created_at?: string;
          currency?: string;
          doc?: Json | null;
          follow_up_at?: string | null;
          follow_up_note?: string | null;
          id?: string;
          idioma?: string | null;
          line_items?: Json;
          lost_note?: string | null;
          lost_reason?: string | null;
          notes?: string | null;
          pdf_bytes?: number | null;
          pdf_sha256?: string | null;
          quote_id?: string | null;
          responded_at?: string | null;
          sent_at?: string | null;
          status?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string | null;
          valid_until?: string | null;
          vat?: number;
          vat_rate?: number;
          versao_em?: string | null;
          versao_numero?: number | null;
          versao_selo?: string | null;
        };
        Update: {
          chosen_version?: string | null;
          client_email?: string | null;
          client_name?: string | null;
          created_at?: string;
          currency?: string;
          doc?: Json | null;
          follow_up_at?: string | null;
          follow_up_note?: string | null;
          id?: string;
          idioma?: string | null;
          line_items?: Json;
          lost_note?: string | null;
          lost_reason?: string | null;
          notes?: string | null;
          pdf_bytes?: number | null;
          pdf_sha256?: string | null;
          quote_id?: string | null;
          responded_at?: string | null;
          sent_at?: string | null;
          status?: string;
          subtotal?: number;
          total?: number;
          updated_at?: string | null;
          valid_until?: string | null;
          vat?: number;
          vat_rate?: number;
          versao_em?: string | null;
          versao_numero?: number | null;
          versao_selo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "proposals_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          created_at: string;
          endpoint: string;
          keys: Json;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          keys: Json;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          keys?: Json;
        };
        Relationships: [];
      };
      quotes: {
        Row: {
          created_at: string;
          data: Json;
          email: string | null;
          id: string;
          name: string | null;
          status: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          data: Json;
          email?: string | null;
          id: string;
          name?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          data?: Json;
          email?: string | null;
          id?: string;
          name?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      reciclagem: {
        Row: {
          apagado_em: string;
          apagado_por: string | null;
          ficheiros: Json;
          id: string;
          origem_id: string;
          retrato: Json;
          rotulo: string;
          tipo: string;
        };
        Insert: {
          apagado_em?: string;
          apagado_por?: string | null;
          ficheiros?: Json;
          id?: string;
          origem_id: string;
          retrato: Json;
          rotulo: string;
          tipo: string;
        };
        Update: {
          apagado_em?: string;
          apagado_por?: string | null;
          ficheiros?: Json;
          id?: string;
          origem_id?: string;
          retrato?: Json;
          rotulo?: string;
          tipo?: string;
        };
        Relationships: [];
      };
      registo_de_acoes: {
        Row: {
          caminho: string;
          id: number;
          metodo: string;
          quando: string;
          quem: string;
        };
        Insert: {
          caminho: string;
          id?: never;
          metodo: string;
          quando?: string;
          quem: string;
        };
        Update: {
          caminho?: string;
          id?: never;
          metodo?: string;
          quando?: string;
          quem?: string;
        };
        Relationships: [];
      };
      service_catalog: {
        Row: {
          archived: boolean;
          category: string;
          created_at: string;
          description: string;
          description_en: string;
          id: string;
          name: string;
          name_en: string;
          updated_at: string;
        };
        Insert: {
          archived?: boolean;
          category?: string;
          created_at?: string;
          description?: string;
          description_en?: string;
          id?: string;
          name: string;
          name_en?: string;
          updated_at?: string;
        };
        Update: {
          archived?: boolean;
          category?: string;
          created_at?: string;
          description?: string;
          description_en?: string;
          id?: string;
          name?: string;
          name_en?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          category: string;
          created_at: string;
          email: string | null;
          id: string;
          location: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          preferred: boolean;
          rating: number | null;
          updated_at: string | null;
        };
        Insert: {
          category?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          preferred?: boolean;
          rating?: number | null;
          updated_at?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          preferred?: boolean;
          rating?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          anexos: Json | null;
          area: string | null;
          assignee: string | null;
          client_name: string | null;
          created_at: string;
          done: boolean;
          due_date: string | null;
          id: string;
          notas: string | null;
          posicao: number | null;
          priority: string;
          quote_id: string | null;
          subtarefas: Json | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          anexos?: Json | null;
          area?: string | null;
          assignee?: string | null;
          client_name?: string | null;
          created_at?: string;
          done?: boolean;
          due_date?: string | null;
          id?: string;
          notas?: string | null;
          posicao?: number | null;
          priority?: string;
          quote_id?: string | null;
          subtarefas?: Json | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          anexos?: Json | null;
          area?: string | null;
          assignee?: string | null;
          client_name?: string | null;
          created_at?: string;
          done?: boolean;
          due_date?: string | null;
          id?: string;
          notas?: string | null;
          posicao?: number | null;
          priority?: string;
          quote_id?: string | null;
          subtarefas?: Json | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      gravar_ligacao_de_proposta: {
        Args: {
          p_codigo: string;
          p_criada_em: string;
          p_expira_em: string;
          p_proposal_id: string;
        };
        Returns: boolean;
      };
      next_invoice_seq: { Args: { p_year: number }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
  public: {
    Enums: {},
  },
} as const;
