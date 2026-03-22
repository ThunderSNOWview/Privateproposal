#![allow(clippy::too_many_arguments)]
//! Generated modules from the idls of the programs we want to interact with.

use anchor_lang::{
    declare_program,
    prelude::AccountMeta,
    solana_program::instruction::Instruction,
};
use std::hash::{Hash, Hasher};

declare_program!(arcium);
#[cfg(feature = "staking")]
declare_program!(arcium_staking);

impl arcium::accounts::MXEAccount {
    pub fn x25519_pubkey(&self) -> Option<[u8; 32]> {
        match &self.utility_pubkeys {
            arcium::types::SetUnset::Set(keys) => Some(keys.x25519_pubkey),
            arcium::types::SetUnset::Unset(keys, set_vec) => {
                if set_vec.iter().all(|&b| b) {
                    Some(keys.x25519_pubkey)
                } else {
                    None
                }
            }
        }
    }
}

impl arcium::types::CallbackInstruction {
    pub fn to_instruction(&self, ix_data: &[u8]) -> Instruction {
        let mut data = Vec::with_capacity(self.discriminator.len() + ix_data.len());
        data.extend_from_slice(&self.discriminator);
        data.extend_from_slice(ix_data);
        Instruction {
            program_id: self.program_id,
            accounts: self.accounts.iter().map(|acc| acc.into()).collect(),
            data,
        }
    }
}

impl From<&arcium::types::CallbackAccount> for AccountMeta {
    fn from(acc: &arcium::types::CallbackAccount) -> Self {
        AccountMeta {
            pubkey: acc.pubkey,
            is_signer: false,
            is_writable: acc.is_writable,
        }
    }
}
