// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {GpuHedgerTypes, IComputeOption} from "./interfaces/IGpuHedger.sol";

/// @title PositionNFT
/// @notice Every GpuHedger option position is an ERC-721 token. Whoever holds the token owns the
///         position and can exercise or claim it, so hedges are transferable and composable.
contract PositionNFT is ERC721Enumerable, AccessControl {
    using Strings for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    struct PositionRef {
        address option;
        uint256 positionId;
    }

    uint256 public nextTokenId = 1;
    mapping(uint256 => PositionRef) private _positions;

    error ZeroAddress();

    constructor(address admin) ERC721("GpuHedger Position", "GPUHEDGE") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Minted by the OptionFactory when a position is opened.
    function mint(address to, address option, uint256 positionId)
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = nextTokenId++;
        _positions[tokenId] = PositionRef(option, positionId);
        _safeMint(to, tokenId);
    }

    function positionOf(uint256 tokenId) external view returns (address option, uint256 positionId) {
        _requireOwned(tokenId);
        PositionRef storage ref = _positions[tokenId];
        return (ref.option, ref.positionId);
    }

    /// @notice Fully onchain metadata and SVG card.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        PositionRef storage ref = _positions[tokenId];
        GpuHedgerTypes.OptionDetails memory d = IComputeOption(ref.option).getOptionDetails();
        GpuHedgerTypes.Position memory p = IComputeOption(ref.option).getPosition(ref.positionId);

        string memory kind = d.optionType == GpuHedgerTypes.OptionType.Call ? "CALL" : "PUT";
        string memory gpu = _bytes32ToString(d.underlying);
        string memory strike = _usd(d.strikePrice);
        string memory title = string.concat(gpu, " ", kind, " $", strike);

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" rx="24" fill="#08090B"/>',
            '<rect x="20" y="20" width="360" height="360" rx="16" fill="#111318" stroke="#23262f"/>',
            '<text x="44" y="78" font-family="monospace" font-size="16" fill="#E6FF4A">GPUHEDGER</text>',
            '<text x="44" y="150" font-family="sans-serif" font-weight="700" font-size="44" fill="#eef0f3">',
            gpu,
            "</text>",
            '<text x="44" y="200" font-family="sans-serif" font-weight="700" font-size="30" fill="',
            d.optionType == GpuHedgerTypes.OptionType.Call ? "#32D583" : "#FF5C7A",
            '">',
            kind,
            " $",
            strike,
            "</text>",
            '<text x="44" y="270" font-family="monospace" font-size="16" fill="#9097a3">',
            p.contracts.toString(),
            " x ",
            d.contractSize.toString(),
            " GPU-hours</text>",
            '<text x="44" y="300" font-family="monospace" font-size="16" fill="#9097a3">Series #',
            d.seriesId.toString(),
            " / Position #",
            ref.positionId.toString(),
            "</text>",
            '<text x="44" y="350" font-family="monospace" font-size="13" fill="#5EE7FF">Hedge the future of compute</text></svg>'
        );

        string memory json = string.concat(
            '{"name":"',
            title,
            '","description":"GpuHedger option position on GPU compute. The holder can exercise or claim it onchain.",',
            '"attributes":[{"trait_type":"GPU","value":"',
            gpu,
            '"},{"trait_type":"Type","value":"',
            kind,
            '"},{"trait_type":"Strike (USD/GPU-h)","value":"',
            strike,
            '"},{"trait_type":"Contracts","value":',
            p.contracts.toString(),
            '},{"trait_type":"Expiration","display_type":"date","value":',
            d.expiration.toString(),
            '}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev 6-decimal amount to "2.20" (two decimals, truncated).
    function _usd(uint256 amount) private pure returns (string memory) {
        uint256 cents = amount / 10_000;
        uint256 frac = cents % 100;
        return string.concat((cents / 100).toString(), ".", frac < 10 ? "0" : "", frac.toString());
    }

    function _bytes32ToString(bytes32 value) private pure returns (string memory) {
        uint256 len;
        while (len < 32 && value[len] != 0) len++;
        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = value[i];
        }
        return string(out);
    }
}
