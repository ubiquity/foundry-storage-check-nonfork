// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Types} from "../basic/Types.sol";

library DiamondStorage {
    struct Struct {
        bool a;
        uint256 b;
        Types.TokenType token;
        uint32 c;
        uint32 d;
        address e;
    }

    /// @notice Storage slot used to store data for this library
    bytes32 constant DIAMOND_STORAGE_SLOT =
        bytes32(
            uint256(keccak256("mocks.diamond.storage")) -
                1
        );

    /**
     * @notice Returns struct used as a storage for this library
     * @return l Struct used as a storage
     */
    function diamondStorage() internal pure returns (Struct storage l) {
        bytes32 slot = DIAMOND_STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
