-- =============================================
-- SERAO Migration v9 — Système P2P
-- =============================================

-- Champs P2P sur orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS p2p_status text NOT NULL DEFAULT 'waiting_payment'
    CHECK (p2p_status IN ('waiting_payment','proof_uploaded','confirmed','disputed','resolved')),
  ADD COLUMN IF NOT EXISTS dispute_reason text;

-- Numéros de paiement sur profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mvola_number text,
  ADD COLUMN IF NOT EXISTS orange_number text,
  ADD COLUMN IF NOT EXISTS airtel_number text;

GRANT UPDATE (mvola_number, orange_number, airtel_number) ON public.profiles TO authenticated;

-- RPC : acheteur envoie preuve de paiement
CREATE OR REPLACE FUNCTION public.upload_payment_proof(p_order_id text, p_proof_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  UPDATE orders SET payment_proof_url=p_proof_url, p2p_status='proof_uploaded'
  WHERE id=p_order_id AND acheteur_id=auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.upload_payment_proof(text,text) TO authenticated;

-- RPC : vendeur confirme paiement reçu
CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  UPDATE orders SET p2p_status='confirmed', status='preparation'
  WHERE id=p_order_id AND vendeur_id=auth.uid() AND p2p_status='proof_uploaded';
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(text) TO authenticated;

-- RPC : vendeur ouvre un litige
CREATE OR REPLACE FUNCTION public.open_order_dispute(p_order_id text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  UPDATE orders SET p2p_status='disputed', dispute_reason=p_reason, status='litige'
  WHERE id=p_order_id AND vendeur_id=auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_order_dispute(text,text) TO authenticated;

-- RPC : admin résout un litige
CREATE OR REPLACE FUNCTION public.resolve_dispute(p_order_id text, p_decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  UPDATE orders SET p2p_status='resolved', status=p_decision
  WHERE id=p_order_id AND p2p_status='disputed';
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(text,text) TO authenticated;

-- DONE
