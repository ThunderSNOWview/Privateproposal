use anchor_lang::prelude::Pubkey;

pub mod idl;
pub use idl::arcium::ID;
pub const ARCIUM_PROGRAM_ID: Pubkey = idl::arcium::ID_CONST;
#[cfg(feature = "transactions")]
pub mod instruction;
pub mod pda;
#[cfg(feature = "transactions")]
pub mod state;
#[cfg(feature = "transactions")]
pub mod transactions;
pub mod utils;
